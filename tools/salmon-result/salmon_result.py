"""iPhone ミラーリングの NSO アプリ（イカリング3）から、サーモンランの最新のリザルトを読み取って記録するスクリプト。

コントロールパネルの「リザルトを取り込む」で /api/salmon/import に依頼が入ると、
1. バイトの詳細画面の「最新のバイトへ」で最新のバイトを表示する（ヒストリーはタブを移っても読み込み直されない）
2. 詳細画面を撮影して data/salmon-results/ に保存し、Vision の OCR で自分の金イクラ・オオモノ・デス・
   クリア / 失敗した WAVE・ステージ・日時を読み、支給ブキはアイコンを参照画像と照合する
3. 「前のバイト」で、記録済みのバイト（または今のセッションの開始）まで遡って、取りこぼしも読む
4. PATCH /api/salmon/import で古い順に送る（サーバーが記録する）。最新のバイトが記録済みなら、
   イカリング3にまだ反映されていないので、待って読み直す

イカリング3の API は直接呼ばない（公式アプリの画面を操作するだけ）。
クリックのたびにカーソルの位置と前面のアプリを元に戻す。
"""

import argparse
import io
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import unicodedata
from dataclasses import dataclass
from difflib import SequenceMatcher, get_close_matches
from datetime import datetime
from pathlib import Path
from urllib.parse import urljoin

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_API_BASE = "http://localhost:3000/"
DEFAULT_CAPTURE_DIR = REPO_ROOT / "data" / "salmon-results"
DEFAULT_REFS_DIR = REPO_ROOT / "data" / "salmon-weapon-refs"

MIRRORING_BUNDLE_ID = "com.apple.ScreenContinuity"
POLL_INTERVAL_SECONDS = 1.0
# イカリング3に新しいバイトが反映されるまで待つ時間。サーバーの SALMON_IMPORT_PROCESSING_TTL_MS（6 分）より短くする
MAX_WAIT_FOR_NEW_JOB_SECONDS = 4 * 60
RETRY_INTERVAL_SECONDS = 15
# 取りこぼしを遡る上限（サーバーの MAX_IMPORT_JOBS と合わせる）
MAX_BACKFILL_JOBS = 20
# 「最新のバイトへ」「前のバイト」を押してから、画面が切り替わり始めるまで待つ時間
PAGE_LOAD_SECONDS = 2
SCREEN_TIMEOUT_SECONDS = 15
RECONNECT_TIMEOUT_SECONDS = 20
# 文字が小さいので、拡大してから OCR する（ミラーリングの画面は 1 倍で 400px 程度の幅しかない）
FULL_OCR_SCALE = 2
CELL_OCR_SCALE = 4
HEADER_OCR_SCALE = 3
TELOP_SUCCEEDED = "リザルトを記録しました"
TELOP_FAILED = "リザルトを取り込めませんでした"


class ImportError_(Exception):
    """取り込みに失敗した理由（コントロールパネルにそのまま表示する）"""


# ---- OCR の結果の解釈（純粋関数。テスト対象） ----


@dataclass(frozen=True)
class Box:
    """OCR で読めた文字列と、画像に対する相対座標（左上が原点、0〜1）"""

    text: str
    x: float
    y: float
    w: float
    h: float

    @property
    def cx(self) -> float:
        return self.x + self.w / 2

    @property
    def cy(self) -> float:
        return self.y + self.h / 2


def normalize(text: str) -> str:
    """NFKC で全角をそろえ、OCR が読み分けない文字（シャ / ジャ、パ / バ など）を比べやすくする"""
    return unicodedata.normalize("NFKC", text).replace(" ", "")


def find_box(boxes: list[Box], *keywords: str, min_y: float = 0.0, max_y: float = 1.0) -> Box | None:
    """keywords のどれかを含む、いちばん上の Box"""
    found = [b for b in boxes if min_y <= b.cy <= max_y and any(k in normalize(b.text) for k in keywords)]
    return min(found, key=lambda b: b.y, default=None)


COUNT_PATTERN = re.compile(r"[xX×]\s*([0-9Il|]{1,4})(?![0-9A-Za-z])|[xX×]\s*(\d{1,4})")
# 1 を英字に読み間違えることがある（Xl、XI など）
DIGIT_LOOKALIKES = str.maketrans({"I": "1", "l": "1", "|": "1"})


def parse_count(text: str) -> int | None:
    """「x12<8>」「オオモノシャケ x24」などから、x の後ろの数を読む（<8> はおかわり＝アシストなので読まない）"""
    match = COUNT_PATTERN.search(normalize(text).replace("×", "x"))
    if not match:
        return None
    return int((match.group(1) or match.group(2)).translate(DIGIT_LOOKALIKES))


PLAYED_AT_PATTERN = re.compile(r"(\d{4})/(\d{1,2})/(\d{1,2})\s+(\d{1,2}):(\d{2})")


def parse_played_at(boxes: list[Box]) -> str | None:
    """詳細画面の左上の日時（例: 2026/11/9 21:18）。同じバイトを二重に記録しないためのキーにする"""
    for box in sorted(boxes, key=lambda b: b.y):
        match = PLAYED_AT_PATTERN.search(unicodedata.normalize("NFKC", box.text))
        if match:
            year, month, day, hour, minute = match.groups()
            return f"{year}/{int(month):02d}/{int(day):02d} {int(hour):02d}:{minute}"
    return None


WAVE_PATTERN = re.compile(r"WAVE(\d)")
MAX_WAVE = 3


# 見出しの「Clear!!」/「Failure」は装飾された文字で読み間違えやすい（Cear!、Failnre など）ので、似ているほうで判定する
OUTCOME_WORDS = {"CLEAR": True, "FAILURE": False}
OUTCOME_MATCH_CUTOFF = 0.7


def classify_outcome(text: str) -> bool | None:
    """見出しの文字が「Clear」なら True、「Failure」なら False、どちらにも似ていなければ None"""
    letters = re.sub(r"[^A-Z]", "", normalize(text).upper())
    if len(letters) < 3:
        return None
    score, cleared = max((SequenceMatcher(None, letters, word).ratio(), value) for word, value in OUTCOME_WORDS.items())
    return cleared if score >= OUTCOME_MATCH_CUTOFF else None


def parse_outcome(boxes: list[Box]) -> tuple[bool, int] | None:
    """クリアしたか、と到達した WAVE。クリアなら (True, 3)。

    見出しの「Clear!!」/「Failure」で判定する（「クリアボーナス」があるので日本語の「クリア」では判定しない）。
    失敗した WAVE は、表示されている WAVE の番号の最大（失敗したバイトでは、失敗した WAVE までしか表示されない）
    """
    outcomes = {result for b in boxes if (result := classify_outcome(b.text)) is not None}
    if len(outcomes) != 1:  # 読めない・両方に読める（読み間違い）なら決めない
        return None
    cleared = outcomes.pop()
    if cleared:
        return True, MAX_WAVE
    texts = [normalize(b.text) for b in boxes]
    waves = [int(m.group(1)) for t in texts for m in WAVE_PATTERN.finditer(t.upper()) if 1 <= int(m.group(1)) <= MAX_WAVE]
    if not waves:
        return None
    return False, max(waves)


# サーモンランの通常のステージ。OCR の読み間違い（アラマ午砦 など）を直すのに使う。
# ビッグランはバトルのステージで行われるので、ここに無いステージは読めたままの文字で記録する
KNOWN_STAGES = (
    "シェケナダム", "難破船ドン・ブラコ", "ムニ・エール海洋発電所", "トキシラズいぶし工房",
    "アラマキ砦", "すじこジャンクション跡", "どんぴこ闘技場",
)
STAGE_MATCH_CUTOFF = 0.6
JAPANESE_PATTERN = re.compile(r"[\u3040-\u30ff\u4e00-\u9fff]")


def find_stage_box(boxes: list[Box], played_at_box: Box) -> Box | None:
    """日時と同じ高さの右側にあるステージ名"""
    candidates = [b for b in boxes if b.x > 0.5 and abs(b.cy - played_at_box.cy) < 0.02 and JAPANESE_PATTERN.search(b.text)]
    return candidates[0] if candidates else None


def canonical_stage(text: str) -> str:
    """読めたステージ名を、似ている既知のステージ名に直す（似ていなければそのまま）"""
    text = normalize(text)
    if not text:
        return ""
    match = get_close_matches(text, KNOWN_STAGES, n=1, cutoff=STAGE_MATCH_CUTOFF)
    return match[0] if match else text


def find_self_row(boxes: list[Box]) -> Box | None:
    """自分の行の「オオモノシャケ x24」。プレイヤーの一覧は自分がいちばん上"""
    return find_box(boxes, "オオモノ", min_y=0.4)


def find_first_history_row(boxes: list[Box]) -> Box | None:
    """バイトヒストリーのいちばん上（最新）のバイトの行。右端の金イクラの数（x126）で行の位置を決める"""
    header = find_box(boxes, "ヒストリー")
    if header is None:
        return None
    rows = [b for b in boxes if b.y > header.y + 0.05 and b.x > 0.7 and re.fullmatch(r"[xX×]\d{1,4}", normalize(b.text))]
    return min(rows, key=lambda b: b.y, default=None)


@dataclass(frozen=True)
class SelfRowCells:
    """自分の行の数値の位置（「オオモノシャケ」の Box を基準にした、画像の幅に対する相対座標）"""

    # (左, 上, 右, 下)。上下は「オオモノシャケ」の上端からのずれ（画像の幅に対する比）
    golden_eggs: tuple[float, float, float, float] = (0.705, -0.06, 0.85, -0.018)
    deaths: tuple[float, float, float, float] = (0.88, -0.01, 0.95, 0.032)
    # 支給ブキとスペシャルのアイコンを探す範囲。アイコンの数で並び方（1 行か 2 行か）が変わるので、位置は決め打ちしない
    icons: tuple[float, float, float, float] = (0.47, -0.079, 0.665, 0.054)


# ---- 画面の操作（macOS。pyobjc を使う） ----


@dataclass(frozen=True)
class Window:
    window_id: int
    x: float
    y: float
    width: float
    height: float


def find_mirroring_window() -> Window:
    import AppKit
    import Quartz

    apps = AppKit.NSRunningApplication.runningApplicationsWithBundleIdentifier_(MIRRORING_BUNDLE_ID)
    if not apps:
        raise ImportError_("iPhone ミラーリングが起動していません")
    pids = {app.processIdentifier() for app in apps}
    windows = Quartz.CGWindowListCopyWindowInfo(Quartz.kCGWindowListOptionOnScreenOnly, Quartz.kCGNullWindowID) or []
    candidates = []
    for info in windows:
        if info.get(Quartz.kCGWindowOwnerPID) not in pids or info.get(Quartz.kCGWindowLayer) != 0:
            continue
        bounds = info[Quartz.kCGWindowBounds]
        if bounds["Height"] < 300:  # メニューバーなどの小さなウインドウは除く
            continue
        candidates.append(Window(int(info[Quartz.kCGWindowNumber]), bounds["X"], bounds["Y"], bounds["Width"], bounds["Height"]))
    if not candidates:
        raise ImportError_("iPhone ミラーリングのウインドウが見つかりません（最小化していないか確認してください）")
    return max(candidates, key=lambda w: w.width * w.height)


def _post_mouse(event_type, point) -> None:
    import Quartz

    event = Quartz.CGEventCreateMouseEvent(None, event_type, point, Quartz.kCGMouseButtonLeft)
    Quartz.CGEventPost(Quartz.kCGHIDEventTap, event)


class _FocusRestorer:
    """ミラーリングを前面にして操作し、終わったらカーソルの位置と前面のアプリを元に戻す"""

    def __enter__(self):
        import AppKit
        import Quartz

        self.front = AppKit.NSWorkspace.sharedWorkspace().frontmostApplication()
        self.cursor = Quartz.CGEventGetLocation(Quartz.CGEventCreate(None))
        mirroring = AppKit.NSRunningApplication.runningApplicationsWithBundleIdentifier_(MIRRORING_BUNDLE_ID)
        if mirroring:
            mirroring[0].activateWithOptions_(0)
        time.sleep(0.15)
        return self

    def __exit__(self, *exc):
        import Quartz

        Quartz.CGWarpMouseCursorPosition(self.cursor)
        if self.front is not None:
            self.front.activateWithOptions_(0)
        return False


def tap(window: Window, rx: float, ry: float) -> None:
    import Quartz

    point = Quartz.CGPointMake(window.x + rx * window.width, window.y + ry * window.height)
    with _FocusRestorer():
        _post_mouse(Quartz.kCGEventMouseMoved, point)
        time.sleep(0.03)
        _post_mouse(Quartz.kCGEventLeftMouseDown, point)
        time.sleep(0.05)
        _post_mouse(Quartz.kCGEventLeftMouseUp, point)
        time.sleep(0.05)


def scroll(window: Window, pixels: int) -> None:
    """負の値で下へ（ページの続きを表示する方向へ）スクロールする"""
    import Quartz

    point = Quartz.CGPointMake(window.x + window.width / 2, window.y + window.height / 2)
    steps = 10
    with _FocusRestorer():
        _post_mouse(Quartz.kCGEventMouseMoved, point)
        time.sleep(0.03)
        for _ in range(steps):
            event = Quartz.CGEventCreateScrollWheelEvent(None, Quartz.kCGScrollEventUnitPixel, 1, pixels // steps)
            Quartz.CGEventPost(Quartz.kCGHIDEventTap, event)
            time.sleep(0.016)
        time.sleep(0.3)


def capture(window: Window, path: Path):
    """ウインドウを撮影する（ほかのウインドウに隠れていても撮れる）"""
    from PIL import Image

    path.parent.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(["screencapture", "-x", "-o", f"-l{window.window_id}", str(path)], capture_output=True)
    if result.returncode != 0 or not path.exists():
        raise ImportError_("iPhone ミラーリングを撮影できません（ターミナルに「画面収録」の権限が必要です）")
    with Image.open(path) as image:
        return image.convert("RGB")


def ocr(image, scale: int = 1) -> list[Box]:
    """Vision で文字を読む。座標は元の画像に対する相対座標"""
    import Vision
    from Foundation import NSData
    from PIL import Image

    if scale != 1:
        image = image.resize((image.width * scale, image.height * scale), Image.LANCZOS)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    data = NSData.dataWithBytes_length_(buffer.getvalue(), len(buffer.getvalue()))
    handler = Vision.VNImageRequestHandler.alloc().initWithData_options_(data, None)
    request = Vision.VNRecognizeTextRequest.alloc().init()
    request.setRecognitionLevel_(Vision.VNRequestTextRecognitionLevelAccurate)
    request.setRecognitionLanguages_(["ja-JP", "en-US"])
    request.setUsesLanguageCorrection_(False)
    ok, _ = handler.performRequests_error_([request], None)
    if not ok:
        return []
    boxes = []
    for observation in request.results() or []:
        candidate = observation.topCandidates_(1)[0]
        b = observation.boundingBox()  # Vision は左下が原点
        boxes.append(Box(candidate.string(), b.origin.x, 1 - b.origin.y - b.size.height, b.size.width, b.size.height))
    return boxes


def crop_relative(image, box: tuple[float, float, float, float]):
    left, top, right, bottom = box
    return image.crop((round(left * image.width), round(top * image.height), round(right * image.width), round(bottom * image.height)))


# ---- ブキの照合 ----

# 実際のアイコン 20 個（4 種）で、正解の類似度は 0.85 以上・2 番目との差は 0.2 以上だった
WEAPON_MATCH_MIN_SCORE = 0.6
WEAPON_MATCH_MIN_MARGIN = 0.08
WEAPON_ICON_COMPARE_SIZE = 32
# イカリング3のアイコンは黒い丸の中にブキが描かれている。丸の外（行の背景）は比べない
WEAPON_ICON_MASK_RADIUS = 0.85
# 参照画像を、丸の中のブキと同じくらいの大きさに縮めて少しぼかす（小さなアイコンに見た目を合わせる）
WEAPON_REF_SCALE = 0.95
WEAPON_REF_BLUR = 0.7


def load_weapon_list() -> list[dict]:
    """lib/salmonWeapons.ts のブキの key と画像の URL（Node 24 の型除去で読む）"""
    script = (
        "const m = await import(process.argv[1]);"
        "console.log(JSON.stringify(m.SALMON_WEAPONS.map((w) => ({key: w.key, url: m.weaponImageUrl(w)}))));"
    )
    result = subprocess.run(
        ["node", "--no-warnings", "--input-type=module", "-e", script, str(REPO_ROOT / "lib" / "salmonWeapons.ts")],
        capture_output=True, text=True, check=True,
    )
    return json.loads(result.stdout)


def ensure_weapon_refs(refs_dir: Path, log=print) -> dict:
    """参照画像を読み込む（無ければダウンロードしてキャッシュする）。取れなかったブキは照合しない"""
    import numpy as np
    import requests
    from PIL import Image

    refs_dir.mkdir(parents=True, exist_ok=True)
    refs = {}
    for weapon in load_weapon_list():
        path = refs_dir / f"{weapon['key']}.png"
        if not path.exists():
            try:
                response = requests.get(weapon["url"], timeout=10)
                response.raise_for_status()
                path.write_bytes(response.content)
            except requests.RequestException as error:
                log(f"警告: {weapon['key']} の画像を取得できませんでした: {error}")
                continue
        with Image.open(path) as image:
            refs[weapon["key"]] = ref_vector(image)
    return refs


def _masked_vector(image) -> "np.ndarray":
    """照合用のベクトル（丸の中の画素だけ。明るさの違いを打ち消すため、平均を引いて長さを 1 にする）"""
    import numpy as np

    size = WEAPON_ICON_COMPARE_SIZE
    yy, xx = np.mgrid[:size, :size]
    center = (size - 1) / 2
    mask = (xx - center) ** 2 + (yy - center) ** 2 <= (WEAPON_ICON_MASK_RADIUS * size / 2) ** 2
    vector = np.asarray(image.convert("RGB"), dtype=np.float32)[mask].reshape(-1)
    vector -= vector.mean()
    norm = np.linalg.norm(vector)
    return vector / norm if norm else vector


def ref_vector(image) -> "np.ndarray":
    """参照画像（透過 PNG）を、イカリング3のアイコンのように黒い丸の中に小さく置いて照合用のベクトルにする"""
    from PIL import Image, ImageFilter

    size = WEAPON_ICON_COMPARE_SIZE
    image = image.convert("RGBA")
    weapon = Image.alpha_composite(Image.new("RGBA", image.size, (0, 0, 0, 255)), image).convert("RGB")
    side = round(size * WEAPON_REF_SCALE)
    canvas = Image.new("RGB", (size, size), (0, 0, 0))
    canvas.paste(weapon.resize((side, side), Image.LANCZOS), ((size - side) // 2, (size - side) // 2))
    return _masked_vector(canvas.filter(ImageFilter.GaussianBlur(WEAPON_REF_BLUR)))


def icon_vector(icon) -> "np.ndarray":
    """詳細画面から切り出したアイコンを照合用のベクトルにする"""
    from PIL import Image

    size = WEAPON_ICON_COMPARE_SIZE
    return _masked_vector(icon.convert("RGB").resize((size, size), Image.LANCZOS))


def match_weapon(icon, refs: dict) -> str | None:
    """いちばん似ている参照画像のブキ。似ていない・2 番目と差が無いなら None（推測で記録しない）"""
    if not refs:
        return None
    vector = icon_vector(icon)
    scores = sorted(((float(vector @ ref), key) for key, ref in refs.items()), reverse=True)
    best_score, best_key = scores[0]
    second_score = scores[1][0] if len(scores) > 1 else -1.0
    if best_score < WEAPON_MATCH_MIN_SCORE or best_score - second_score < WEAPON_MATCH_MIN_MARGIN:
        return None
    return best_key


# アイコンとみなす大きさ（画像の幅に対する比）。イカリング3のアイコンは幅 407px で 17〜18px
MIN_ICON_SIZE = 0.025
# 背景（行の赤）との色の差がこれより大きい画素をアイコンとみなす
ICON_COLOR_DISTANCE = 90
# アイコンの外接矩形を埋める割合。ブキは丸（0.77〜0.85）、スペシャルは角丸の四角（0.94〜0.96）
MAX_WEAPON_ICON_FILL = 0.9


def find_icon_blobs(region) -> list[tuple[int, int, int, int, float]]:
    """背景と色の違うまとまり（アイコン）の (左, 上, 幅, 高さ, 外接矩形を埋める割合)。上の行から左→右の順"""
    import numpy as np

    pixels = np.asarray(region.convert("RGB"), dtype=np.int32)
    background = np.median(pixels.reshape(-1, 3), axis=0)
    mask = np.abs(pixels - background).sum(axis=2) > ICON_COLOR_DISTANCE
    seen = np.zeros_like(mask)
    height, width = mask.shape
    min_size = MIN_ICON_SIZE * region.info.get("full_width", region.width)
    blobs = []
    for y0 in range(height):
        for x0 in range(width):
            if not mask[y0, x0] or seen[y0, x0]:
                continue
            stack, points = [(y0, x0)], []
            seen[y0, x0] = True
            while stack:
                y, x = stack.pop()
                points.append((y, x))
                for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                    if 0 <= ny < height and 0 <= nx < width and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        stack.append((ny, nx))
            ys = [p[0] for p in points]
            xs = [p[1] for p in points]
            w, h = max(xs) - min(xs) + 1, max(ys) - min(ys) + 1
            if w >= min_size and h >= min_size:
                blobs.append((min(xs), min(ys), w, h, len(points) / (w * h)))
    # 同じ行（上端がアイコンの半分以内）なら左から
    return sorted(blobs, key=lambda b: (round(b[1] / max(1, b[3] * 0.5)), b[0]))


def weapon_icons(image, row: Box, cells: "SelfRowCells") -> list:
    """自分の行の支給ブキのアイコン（丸いもの。四角いスペシャルは除く）を、支給された順に切り出す"""
    left, top, right, bottom = cells.icons
    ratio = image.width / image.height
    region = crop_relative(image, (left, row.y + top * ratio, right, row.y + bottom * ratio))
    region.info["full_width"] = image.width
    return [
        region.crop((x, y, x + w, y + h))
        for x, y, w, h, fill in find_icon_blobs(region)
        if fill < MAX_WEAPON_ICON_FILL
    ]


# ---- 詳細画面の読み取り ----

# 数字のセルは読み方によって読めたり読めなかったりするので、いくつかの方法で読んで多数決にする
CELL_OCR_SCALES = (4, 3, 5, 8)  # 1 桁（x9 など）は短くて 8 倍でないと読めないことがある
CELL_BINARIZE_THRESHOLD = 180


def binarize_white_text(image, scale: int, threshold: int = CELL_BINARIZE_THRESHOLD):
    """暗い背景の白い文字だけを、白地に黒い文字にする（文字の周りのアイコン・枠の色で読み間違えないように）"""
    from PIL import Image, ImageOps

    gray = image.convert("L").resize((image.width * scale, image.height * scale), Image.LANCZOS)
    binary = gray.point(lambda v: 0 if v > threshold else 255)
    return ImageOps.expand(binary, border=20, fill=255).convert("RGB")


def vote_count(cell, ocr_fn=None) -> int | None:
    """セルの「x12」の数。読み方ごとの結果の多数決（同数なら先に読めたもの）。どの読み方でも読めなければ None"""
    ocr_fn = ocr_fn or ocr
    readings = [lambda scale=scale: ocr_fn(cell, scale) for scale in CELL_OCR_SCALES]
    readings.append(lambda: ocr_fn(binarize_white_text(cell, CELL_OCR_SCALE), 1))
    values = []
    for read in readings:
        value = parse_count(" ".join(b.text for b in read()))
        if value is not None:
            values.append(value)
    if not values:
        return None
    return max(values, key=lambda v: (values.count(v), -values.index(v)))



# 詳細画面の左上の日時の位置。ステージの画像の上に白い文字で出るので、明るいステージでは全体の OCR で読めない
PLAYED_AT_REGION = (0.02, 0.155, 0.36, 0.185)
PLAYED_AT_BINARIZE_THRESHOLDS = (210, 180)


def read_played_at(image, boxes: list[Box], ocr_fn=None) -> str | None:
    """バイトの日時。全体の OCR と、日時の部分を切り出していくつかの方法で読んだ結果の多数決"""
    ocr_fn = ocr_fn or ocr
    region = crop_relative(image, PLAYED_AT_REGION)
    candidates = [parse_played_at(boxes)]
    candidates += [parse_played_at(ocr_fn(binarize_white_text(region, CELL_OCR_SCALE, t), 1)) for t in PLAYED_AT_BINARIZE_THRESHOLDS]
    candidates.append(parse_played_at(ocr_fn(region, CELL_OCR_SCALE)))
    values = [c for c in candidates if c is not None]
    if not values:
        return None
    return max(values, key=lambda v: (values.count(v), -values.index(v)))


def read_job(image, refs: dict, cells: SelfRowCells = SelfRowCells(), ocr_fn=ocr) -> tuple[dict, str]:
    """詳細画面の画像から、記録するバイト（NewSalmonJob）と日時を読む。読めない項目があれば ImportError_"""
    boxes = ocr_fn(image, FULL_OCR_SCALE)
    played_at = read_played_at(image, boxes, ocr_fn)
    if played_at is None:
        raise ImportError_("バイトの日時を読み取れませんでした（詳細画面が開いていない可能性があります）")
    row = find_self_row(boxes)
    if row is None:
        raise ImportError_("自分の行（オオモノシャケ）が見つかりませんでした")
    left, top, right, bottom = PLAYED_AT_REGION
    played_at_box = next(
        (b for b in boxes if PLAYED_AT_PATTERN.search(unicodedata.normalize("NFKC", b.text))),
        Box("", left, top, right - left, bottom - top),
    )
    # 見出しは全体の OCR では読めないことがあるので、日時の下を切り出して拡大して読み直す。
    # プレイヤー名（Clare など）で判定しないよう、プレイヤーの一覧より上の文字だけを使う
    header = crop_relative(image, (0.3, played_at_box.y, 0.7, min(1.0, played_at_box.y + 0.06)))
    header_boxes = [Box(b.text, 0, 0, 0, 0) for b in ocr_fn(header, HEADER_OCR_SCALE)]
    outcome = parse_outcome([b for b in boxes if b.y < row.y - 0.05] + header_boxes)
    if outcome is None:
        raise ImportError_("クリア / 失敗を読み取れませんでした")

    # 縦の位置は画像の幅に対する比で持っているので、画像の縦横比で高さに対する比へ直す
    ratio = image.width / image.height

    def cell(box: tuple[float, float, float, float]):
        left, top, right, bottom = box
        return crop_relative(image, (left, row.y + top * ratio, right, row.y + bottom * ratio))

    def read_cell_count(box, label: str) -> int:
        value = vote_count(cell(box), ocr_fn)
        if value is None:
            raise ImportError_(f"{label}を読み取れませんでした")
        return value

    boss_kills = parse_count(row.text)
    if boss_kills is None:
        boss_kills = read_cell_count((0.05, 0, 0.3, 0.035), "オオモノの討伐数")
    golden_eggs = read_cell_count(cells.golden_eggs, "金イクラの納品数")
    deaths = read_cell_count(cells.deaths, "被救助数")

    weapons = [key for key in (match_weapon(icon, refs) for icon in weapon_icons(image, row, cells)) if key]

    stage_box = find_stage_box(boxes, played_at_box)
    stage = ""
    if stage_box is not None:
        # 小さい文字なので、ステージ名だけを切り出して拡大して読み直す
        pad = 0.01
        crop = crop_relative(image, (stage_box.x - pad, stage_box.y - pad, min(1.0, stage_box.x + stage_box.w + pad), stage_box.y + stage_box.h + pad))
        stage = canonical_stage("".join(b.text for b in ocr_fn(crop, CELL_OCR_SCALE)) or stage_box.text)
    cleared, wave = outcome
    job = {
        "goldenEggs": golden_eggs,
        "bossKills": boss_kills,
        "deaths": deaths,
        "cleared": cleared,
        "waveReached": wave,
        "stage": stage,
        "weapons": weapons,
    }
    return job, played_at


# ---- 画面の移動 ----


def wait_for_screen(window: Window, *keywords: str, timeout: float = SCREEN_TIMEOUT_SECONDS) -> tuple[object, list[Box]]:
    """keywords のどれかが見えるまで撮影して OCR する"""
    deadline = time.monotonic() + timeout
    with tempfile.TemporaryDirectory() as tmp:
        while True:
            image = capture(window, Path(tmp) / "screen.png")
            boxes = ocr(image, FULL_OCR_SCALE)
            if any(find_box(boxes, k) for k in keywords):
                return image, boxes
            if time.monotonic() > deadline:
                return image, boxes
            time.sleep(1)


def ensure_connected(window: Window, log=print) -> None:
    """「接続が一時停止されました」なら「再開」を押して、つながるまで待つ"""
    _, boxes = wait_for_screen(window, "サーモンラン", "ホーム", "再開", timeout=3)
    resume = find_box(boxes, "再開")
    if resume is None:
        return
    log("ミラーリングの接続を再開します")
    tap(window, resume.cx, resume.cy)
    _, boxes = wait_for_screen(window, "サーモンラン", timeout=RECONNECT_TIMEOUT_SECONDS)
    if find_box(boxes, "サーモンラン") is None:
        raise ImportError_("iPhone ミラーリングに接続できませんでした")


def is_job_detail(boxes: list[Box]) -> bool:
    """バイトの詳細画面か（下に「最新のバイトへ」「前のバイト」のボタンがある）"""
    return find_box(boxes, "前のバイト", "最新のバイト", "最新のパイト", "前のパイト") is not None


def tab_position(boxes: list[Box], label: str) -> tuple[float, float] | None:
    tab = find_box(boxes, label, min_y=0.88)
    return (tab.cx, tab.cy) if tab else None


def open_any_job(window: Window, boxes: list[Box]) -> list[Box]:
    """バイトの詳細画面でなければ、サーモンランのヒストリーからいちばん上のバイトを開く"""
    if is_job_detail(boxes):
        return boxes
    salmon = tab_position(boxes, "サーモンラン")
    if salmon is None:
        raise ImportError_("イカリング3が開かれていません（NSO アプリでイカリング3を開いてください）")
    tap(window, *salmon)
    _, boxes = wait_for_screen(window, "ヒストリー")
    row = find_first_history_row(boxes)
    if row is None:
        # ページの先頭では、最新のバイトがタブの下に隠れているので少しスクロールする
        scroll(window, -300)
        _, boxes = wait_for_screen(window, "ヒストリー")
        row = find_first_history_row(boxes)
    if row is None:
        raise ImportError_("バイトヒストリーが見つかりませんでした")
    tap(window, 0.5, row.cy)
    _, boxes = wait_for_screen(window, "前のバイト", "最新のバイト", "最新のパイト")
    if not is_job_detail(boxes):
        raise ImportError_("バイトの詳細画面を開けませんでした")
    return boxes


# 「次のバイト」のボタンの位置（OCR で見つからないとき用）。最新のバイトでは押せなくなり、文字が灰色になる
NEXT_JOB_BUTTON_REGION = (0.574, 0.869, 0.718, 0.882)
# 「次のバイト」の文字の明るさ（最大値）。押せるときは白（255）、押せないときは灰色（117 程度）
NEXT_JOB_ENABLED_BRIGHTNESS = 180


def is_latest_job(image, boxes: list[Box]) -> bool:
    """最新のバイトの詳細画面か（「次のバイト」が押せない＝文字が灰色）"""
    import numpy as np

    button = find_box(boxes, "次のバイト", "次のパイト", min_y=0.8)
    region = (button.x, button.y, button.x + button.w, button.y + button.h) if button else NEXT_JOB_BUTTON_REGION
    brightness = float(np.asarray(crop_relative(image, region).convert("L")).max())
    return brightness < NEXT_JOB_ENABLED_BRIGHTNESS


def open_latest_job(window: Window) -> None:
    """詳細画面の「最新のバイトへ」で、最新のバイトを読み込み直して表示する
    （ヒストリーはタブを移っても読み込み直されず、新しいバイトが出てこない）。
    押した直後は前の画面のままなので、「次のバイト」が押せなくなる（最新のバイトになる）まで待つ"""
    _, boxes = wait_for_screen(window, "サーモンラン", timeout=3)
    boxes = open_any_job(window, boxes)
    latest = find_box(boxes, "最新のバイト", "最新のパイト")
    if latest is None:
        raise ImportError_("「最新のバイトへ」のボタンが見つかりませんでした")
    tap(window, latest.cx, latest.cy)
    deadline = time.monotonic() + SCREEN_TIMEOUT_SECONDS
    while time.monotonic() < deadline:
        time.sleep(1)
        image, boxes = wait_for_screen(window, "オオモノ", timeout=3)
        if is_job_detail(boxes) and find_self_row(boxes) is not None and is_latest_job(image, boxes):
            return
    raise ImportError_("最新のバイトを表示できませんでした")


def open_previous_job(window: Window, played_at: str) -> bool:
    """「前のバイト」で 1 つ前のバイトを表示する。日時が変わらなければ（いちばん古いバイトなど）False"""
    _, boxes = wait_for_screen(window, "前のバイト", "前のパイト", timeout=3)
    previous = find_box(boxes, "前のバイト", "前のパイト")
    if previous is None:
        return False
    tap(window, previous.cx, previous.cy)
    time.sleep(PAGE_LOAD_SECONDS)
    deadline = time.monotonic() + SCREEN_TIMEOUT_SECONDS
    while time.monotonic() < deadline:
        image, boxes = wait_for_screen(window, "オオモノ", timeout=3)
        current = read_played_at(image, boxes)
        if current is not None and current != played_at and find_self_row(boxes) is not None:
            return True
        time.sleep(1)
    return False


def played_at_timestamp(played_at: str) -> float:
    """「2026/11/10 21:05」（このスクリプトを動かしている Mac の時刻）を UNIX 時間（ミリ秒）にする"""
    return datetime.strptime(played_at, "%Y/%m/%d %H:%M").timestamp() * 1000


def should_stop_backfill(played_at: str, recorded: set[str], session_started_at: float | None) -> bool:
    """取りこぼしを遡るのをやめるか。記録済みのバイト、今のセッションより前のバイトまで来たらやめる
    （セッションが無ければ遡らない。前の配信のバイトまで記録しないように）"""
    if played_at in recorded or session_started_at is None:
        return True
    return played_at_timestamp(played_at) < session_started_at


# ---- API との通信 ----


class Api:
    def __init__(self, base: str):
        import requests

        self.session = requests.Session()
        self.import_url = urljoin(base, "api/salmon/import")
        self.telop_url = urljoin(base, "api/telop")

    def pending(self) -> list[dict]:
        response = self.session.get(self.import_url, params={"status": "pending"}, timeout=5)
        response.raise_for_status()
        return response.json()["imports"]

    def recorded(self) -> tuple[set[str], float | None]:
        """記録済みのバイトの日時と、今のセッションの開始時刻（ミリ秒）"""
        response = self.session.get(self.import_url, params={"view": "recorded"}, timeout=5)
        response.raise_for_status()
        body = response.json()
        return set(body["playedAt"]), body["sessionStartedAt"]

    def update(self, body: dict) -> int:
        return self.session.patch(self.import_url, json=body, timeout=10).status_code

    def telop(self, text: str) -> None:
        try:
            self.session.post(self.telop_url, json={"text": text}, timeout=5)
        except Exception:  # テロップは知らせるだけなので、出せなくても取り込みは止めない
            pass


def capture_name(now: datetime, label: str) -> str:
    return f"{now.strftime('%Y%m%d-%H%M%S')}-{label}.png"


def process_request(request_id: int, api: Api, refs: dict, capture_dir: Path, log=print) -> None:
    if api.update({"id": request_id, "status": "processing"}) != 200:
        log(f"依頼 {request_id} はもう処理できません（期限切れなど）")
        return
    log(f"依頼 {request_id}: 最新のリザルトを取り込みます")
    captures: list[str] = []
    window: Window | None = None
    deadline = time.monotonic() + MAX_WAIT_FOR_NEW_JOB_SECONDS
    try:
        window = find_mirroring_window()
        ensure_connected(window, log)
        while True:
            recorded, session_started_at = api.recorded()
            open_latest_job(window)

            def read_current(label: str) -> tuple[dict, str]:
                nonlocal captures
                name = capture_name(datetime.now(), label)
                image = capture(window, capture_dir / name)
                captures = [*captures, name][-10:]
                return read_job(image, refs)

            job, played_at = read_current("detail")
            log(f"読み取り: {played_at} {job}")
            if played_at in recorded:
                if time.monotonic() + RETRY_INTERVAL_SECONDS > deadline:
                    raise ImportError_("新しいバイトがイカリング3に反映されませんでした（最新のバイトは記録済みです）")
                log(f"{played_at} のバイトは記録済みです。イカリング3への反映を待って読み直します")
                time.sleep(RETRY_INTERVAL_SECONDS)
                continue

            jobs = [{"job": job, "playedAt": played_at}]
            # 取りこぼしを遡る。読めないバイトがあればそこでやめ、読めた分だけ記録する
            while len(jobs) < MAX_BACKFILL_JOBS and open_previous_job(window, played_at):
                try:
                    previous_job, previous_played_at = read_current("detail")
                except ImportError_ as error:
                    log(f"警告: 前のバイトを読み取れなかったので、遡るのをやめます: {error}")
                    break
                if previous_played_at in {j["playedAt"] for j in jobs} or should_stop_backfill(
                    previous_played_at, recorded, session_started_at
                ):
                    break
                log(f"取りこぼし: {previous_played_at} {previous_job}")
                jobs.append({"job": previous_job, "playedAt": previous_played_at})
                played_at = previous_played_at

            status = api.update({"id": request_id, "status": "succeeded", "jobs": jobs[::-1], "captures": captures})
            if status == 200:
                log(f"依頼 {request_id}: {len(jobs)} 件記録しました")
                api.telop(TELOP_SUCCEEDED)
                return
            if status != 409:
                raise ImportError_(f"結果を記録できませんでした（HTTP {status}）")
            # 読んでいる間に、別の取り込みで記録された
            if time.monotonic() > deadline:
                raise ImportError_("読み取ったバイトはすべて記録済みでした")
            log("読み取ったバイトはすべて記録済みでした。読み直します")
    except ImportError_ as error:
        reason = str(error)
    except Exception as error:  # 想定外の失敗でも依頼を取り込み中のまま残さない
        reason = f"想定外のエラー: {error}"
    log(f"依頼 {request_id}: 取り込めませんでした: {reason}")
    if window is not None:
        # どの画面で失敗したかを後から確認できるように残す
        try:
            name = capture_name(datetime.now(), "error")
            capture(window, capture_dir / name)
            captures = [*captures, name][-10:]
        except Exception:
            pass
    api.update({"id": request_id, "status": "failed", "error": reason, "captures": captures})
    api.telop(TELOP_FAILED)


def run(api_base: str, capture_dir: Path, refs_dir: Path) -> None:
    api = Api(api_base)
    refs = ensure_weapon_refs(refs_dir)
    print(f"[salmon-result] ブキの参照画像: {len(refs)} 種。{api.import_url} の依頼を待っています", flush=True)
    attempted: set[int] = set()
    warned = False
    while True:
        try:
            for request in api.pending():
                if request["id"] in attempted:
                    continue
                attempted.add(request["id"])  # 結果を送れなくても、同じ依頼を何度も操作しない
                process_request(request["id"], api, refs, capture_dir, log=lambda m: print(f"[salmon-result] {m}", flush=True))
            warned = False
        except Exception as error:
            # Next.js が止まっている間、1 秒ごとに同じ警告を出し続けない
            if not warned:
                print(f"[salmon-result] 警告: 依頼を取得できませんでした: {error}", file=sys.stderr, flush=True)
            warned = True
        time.sleep(POLL_INTERVAL_SECONDS)


def read_file(path: Path, refs_dir: Path) -> None:
    """保存したキャプチャを読み取って結果を表示する（読み取り位置の調整用）"""
    from PIL import Image

    with Image.open(path) as image:
        job, played_at = read_job(image.convert("RGB"), ensure_weapon_refs(refs_dir))
    print(json.dumps({"playedAt": played_at, **job}, ensure_ascii=False, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--read", type=Path, help="保存したキャプチャを読み取って結果を表示する（記録はしない）")
    args = parser.parse_args()
    capture_dir = Path(os.environ.get("SALMON_CAPTURE_DIR", DEFAULT_CAPTURE_DIR))
    refs_dir = Path(os.environ.get("SALMON_WEAPON_REFS_DIR", DEFAULT_REFS_DIR))
    if args.read:
        read_file(args.read, refs_dir)
        return
    run(os.environ.get("SALMON_API_BASE", DEFAULT_API_BASE), capture_dir, refs_dir)


if __name__ == "__main__":
    main()
