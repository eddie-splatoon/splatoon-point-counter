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
from functools import cache
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
# 依頼に残すキャプチャのファイル名の数（オオモノの欄の分も入るので、取りこぼしが多いと古いものから外れる）
MAX_CAPTURES = 10
# 「最新のバイトへ」「前のバイト」を押してから、画面が切り替わり始めるまで待つ時間
PAGE_LOAD_SECONDS = 2
SCREEN_TIMEOUT_SECONDS = 15
RECONNECT_TIMEOUT_SECONDS = 20
# 文字が小さいので、拡大してから OCR する（ミラーリングの画面は 1 倍で 400px 程度の幅しかない）
FULL_OCR_SCALE = 2
CELL_OCR_SCALE = 4
HEADER_OCR_SCALES = (3, 4)  # 見出しの「Clear!!」は倍率によって読めたり読めなかったりする
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


# x を「メ」と読むことがある（オオモノジャケ メ17）。
# 数のすぐ後ろが「>」のものは読まない（x31<2> の「<」を 4 と読んだ「x3142>」を 3142 にしないため。どこまでが数か分からない）
COUNT_PATTERN = re.compile(r"[xX×メ]\s*([0-9Iil|]{1,4})(?![0-9A-Za-z>])|[xX×メ]\s*(\d{1,4})(?![\d>])")
# 1 を英字に読み間違えることがある（Xl、XI など）
DIGIT_LOOKALIKES = str.maketrans({"I": "1", "i": "1", "l": "1", "|": "1"})  # x17 を「メi7」と読むことがある（parse_count）


def parse_count(text: str) -> int | None:
    """「x12<8>」「オオモノシャケ x24」などから、x の後ろの数を読む（<8> はおかわり＝アシストなので読まない）"""
    match = COUNT_PATTERN.search(normalize(text).replace("×", "x"))
    if not match:
        return None
    digits = match.group(1) or match.group(2)
    # 「i」は x17 を「メi7」と読んだときの 1 だが、「xil」（x17）のように数字が 1 つも無いと何の数か分からないので読まない
    if "i" in digits and not any(c.isdigit() for c in digits):
        return None
    return int(digits.translate(DIGIT_LOOKALIKES))


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
TEAM_CONTEST_MAX_WAVE = 5  # バイトチームコンテストは WAVE 5 まで（オカシラは出ない）

# 詳細画面のいちばん上のタイトル（バイトの種類）。値は lib/salmonTypes.ts の SalmonJobKind
JOB_KIND_TITLES = {"いつものバイト": "regular", "ビッグラン": "bigRun", "バイトチームコンテスト": "teamContest"}
JOB_KIND_TITLE_Y = (0.11, 0.16)
JOB_KIND_MATCH_CUTOFF = 0.6


def max_wave_for(kind: str | None) -> int:
    """クリアしたときの WAVE 数（種類がわからなければ通常の 3）"""
    return TEAM_CONTEST_MAX_WAVE if kind == "teamContest" else MAX_WAVE


def parse_job_kind(boxes: list[Box]) -> str | None:
    """タイトルからバイトの種類を読む。読めなくても WAVE 4・5 の見出しがあればバイトチームコンテスト。わからなければ None"""
    for box in boxes:
        if JOB_KIND_TITLE_Y[0] < box.cy < JOB_KIND_TITLE_Y[1] and 0.25 < box.cx < 0.75:
            title = closest(box.text, tuple(JOB_KIND_TITLES), JOB_KIND_MATCH_CUTOFF)
            if title:
                return JOB_KIND_TITLES[title]
    if any(MAX_WAVE < wave <= TEAM_CONTEST_MAX_WAVE for wave, _ in wave_headers(boxes)):
        return "teamContest"
    return None


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


def parse_outcome(boxes: list[Box], max_wave: int = MAX_WAVE) -> tuple[bool, int] | None:
    """クリアしたか、と到達した WAVE。クリアなら (True, max_wave)（バイトチームコンテストは 5）。

    見出しの「Clear!!」/「Failure」で判定する（「クリアボーナス」があるので日本語の「クリア」では判定しない）。
    明るいステージでは倍率によって Failure に似た文字（FiLcaP）に読むことがあるので、読めたものの多数決にする。
    失敗した WAVE は、表示されている WAVE の番号の最大（失敗したバイトでは、失敗した WAVE までしか表示されない）
    """
    votes = [result for b in boxes if (result := classify_outcome(b.text)) is not None]
    if votes.count(True) == votes.count(False):  # 読めない・どちらとも決められないなら決めない
        return None
    cleared = votes.count(True) > votes.count(False)
    if cleared:
        return True, max_wave
    texts = [normalize(b.text) for b in boxes]
    waves = [int(m.group(1)) for t in texts for m in WAVE_PATTERN.finditer(t.upper()) if 1 <= int(m.group(1)) <= max_wave]
    if not waves:
        return None
    return False, max(waves)


# サーモンランのステージ。OCR の読み間違い（アラマ午砦 など）を直すのに使う。
# ビッグランはバトルのステージで行われる（これまでに開催されたものを並べている）。ここに無いステージは読めたままの文字で記録する
KNOWN_STAGES = (
    "シェケナダム", "難破船ドン・ブラコ", "ムニ・エール海洋発電所", "トキシラズいぶし工房",
    "アラマキ砦", "すじこジャンクション跡", "どんぴこ闘技場",
    "海女美術大学", "マテガイ放水路", "タラポートショッピングパーク", "スメーシーワールド", "ゴンズイ地区",
)
STAGE_MATCH_CUTOFF = 0.6
# ステージ名は小さい文字なので、何通りかの倍率で読んだ結果の多数決にする
STAGE_OCR_SCALES = (2, 3, 4, 6)
JAPANESE_PATTERN = re.compile(r"[\u3040-\u30ff\u4e00-\u9fff]")


def find_stage_box(boxes: list[Box], played_at_box: Box) -> Box | None:
    """日時と同じ高さの右側にあるステージ名"""
    candidates = [b for b in boxes if b.x > 0.5 and abs(b.cy - played_at_box.cy) < 0.02 and JAPANESE_PATTERN.search(b.text)]
    return candidates[0] if candidates else None


def _without_voicing(text: str) -> str:
    """濁点・半濁点を除く（小さい文字では「ぴ」を「び」、「ポ」を「ボ」と読み違えやすいので、比べるときは区別しない）"""
    return "".join(c for c in unicodedata.normalize("NFD", text) if c not in "\u3099\u309a")


def canonical_stage(text: str) -> str:
    """読めたステージ名を、似ている既知のステージ名に直す（似ていなければそのまま）"""
    text = normalize(text)
    if not text:
        return ""
    keys = {_without_voicing(stage): stage for stage in KNOWN_STAGES}
    match = get_close_matches(_without_voicing(text), list(keys), n=1, cutoff=STAGE_MATCH_CUTOFF)
    return keys[match[0]] if match else text


def vote_stage(texts: list[str]) -> str:
    """いくつかの読み方で読んだステージ名。既知のステージに直せたものの多数決、直せなければ最初に読めたもの"""
    stages = [canonical_stage(t) for t in texts if normalize(t)]
    return majority([st for st in stages if st in KNOWN_STAGES]) or (stages[0] if stages else "")


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


# ミラーリングが前面になるまで待つ時間
ACTIVATE_TIMEOUT_SECONDS = 1.5


def _ax_app(pid: int):
    import ApplicationServices

    return ApplicationServices.AXUIElementCreateApplication(pid)


def _is_frontmost(pid: int) -> bool:
    import ApplicationServices

    error, value = ApplicationServices.AXUIElementCopyAttributeValue(_ax_app(pid), ApplicationServices.kAXFrontmostAttribute, None)
    return error == 0 and bool(value)


def _set_frontmost(pid: int) -> None:
    """アクセシビリティの API で前面にする。NSRunningApplication.activate はほかのアプリ（コントロールパネルを開いた
    ブラウザなど）が前面のときに拒否されることがあり、前面にならないままのクリックはウインドウを前面にするだけで押されない"""
    import ApplicationServices

    ApplicationServices.AXUIElementSetAttributeValue(_ax_app(pid), ApplicationServices.kAXFrontmostAttribute, True)


def _frontmost_pid() -> int | None:
    """いま前面のアプリ。NSWorkspace.frontmostApplication はこのスクリプト（イベントループが無い）では更新されないので、
    アクセシビリティの API で各アプリに前面かを聞く"""
    import AppKit

    for app in AppKit.NSWorkspace.sharedWorkspace().runningApplications():
        if app.activationPolicy() == AppKit.NSApplicationActivationPolicyRegular and _is_frontmost(app.processIdentifier()):
            return app.processIdentifier()
    return None


ACCESSIBILITY_ERROR = (
    "このスクリプトを起動したアプリ（ターミナル）に、クリックするための権限がありません。権限が無いとクリックが黙って無視されます"
    "（システム設定 → プライバシーとセキュリティ → 「デバイスの制御とデータへのアクセス」。macOS 26 までは「アクセシビリティ」）"
)


def has_accessibility_permission() -> bool:
    import ApplicationServices

    return bool(ApplicationServices.AXIsProcessTrusted())


class _FocusRestorer:
    """ミラーリングを前面にして操作し、終わったらカーソルの位置と前面のアプリを元に戻す"""

    def __enter__(self):
        import AppKit
        import Quartz

        if not has_accessibility_permission():
            raise ImportError_(ACCESSIBILITY_ERROR)
        self.front_pid = _frontmost_pid()
        self.cursor = Quartz.CGEventGetLocation(Quartz.CGEventCreate(None))
        mirroring = AppKit.NSRunningApplication.runningApplicationsWithBundleIdentifier_(MIRRORING_BUNDLE_ID)
        if not mirroring:
            raise ImportError_("iPhone ミラーリングが起動していません")
        pid = mirroring[0].processIdentifier()
        _set_frontmost(pid)
        deadline = time.monotonic() + ACTIVATE_TIMEOUT_SECONDS
        while not _is_frontmost(pid):
            if time.monotonic() > deadline:
                self.__exit__()
                raise ImportError_("iPhone ミラーリングを前面にできませんでした")
            time.sleep(0.05)
        time.sleep(0.1)  # 前面になった直後のクリックが取りこぼされないように
        return self

    def __exit__(self, *exc):
        import Quartz

        Quartz.CGWarpMouseCursorPosition(self.cursor)
        if self.front_pid is not None:
            _set_frontmost(self.front_pid)
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


def load_weapon_list(kind: str = "weapons") -> list[dict]:
    """lib/salmonWeapons.ts のブキ（kind="specials" ならスペシャル）の key と画像の URL（Node 24 の型除去で読む）"""
    script = (
        "const m = await import(process.argv[1]);"
        "const list = process.argv[2] === 'specials'"
        " ? m.SALMON_SPECIALS.map((w) => ({key: w.key, url: m.specialImageUrl(w)}))"
        " : m.SALMON_WEAPONS.map((w) => ({key: w.key, url: m.weaponImageUrl(w)}));"
        "console.log(JSON.stringify(list));"
    )
    result = subprocess.run(
        ["node", "--no-warnings", "--input-type=module", "-e", script, str(REPO_ROOT / "lib" / "salmonWeapons.ts"), kind],
        capture_output=True, text=True, check=True,
    )
    return json.loads(result.stdout)


def _load_refs(items: list[dict], refs_dir: Path, to_vector, log=print) -> dict:
    """参照画像を読み込む（無ければダウンロードしてキャッシュする）。取れなかったものは照合しない"""
    import requests
    from PIL import Image

    refs_dir.mkdir(parents=True, exist_ok=True)
    refs = {}
    for item in items:
        path = refs_dir / f"{item['key']}.png"
        if not path.exists():
            try:
                response = requests.get(item["url"], timeout=10)
                response.raise_for_status()
                path.write_bytes(response.content)
            except requests.RequestException as error:
                log(f"警告: {item['key']} の画像を取得できませんでした: {error}")
                continue
        with Image.open(path) as image:
            refs[item["key"]] = to_vector(image)
    return refs


def ensure_weapon_refs(refs_dir: Path, log=print) -> dict:
    """ブキの参照画像"""
    return _load_refs(load_weapon_list(), refs_dir, ref_vector, log)


def ensure_special_refs(refs_dir: Path, log=print) -> dict:
    """スペシャルの参照画像（ブキの参照画像のディレクトリの specials/ にキャッシュする）"""
    return _load_refs(load_weapon_list("specials"), refs_dir / "specials", special_ref_vector, log)


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


# スペシャルのアイコンは黒い角丸の四角に、インクの色と白でシルエットが描かれている。参照画像（白黒・透過）とは色が違うので、
# 形（参照画像は不透明度、アイコンは明るさ）で比べる。実際のアイコン 12 個で正解はすべて 1 位、類似度 0.38〜0.77・2 位との差 0.05 以上
SPECIAL_REF_SCALE = 0.8
SPECIAL_MATCH_MIN_SCORE = 0.3
SPECIAL_MATCH_MIN_MARGIN = 0.04


def _shape_vector(pixels) -> "np.ndarray":
    import numpy as np

    vector = np.asarray(pixels, dtype=np.float32).reshape(-1)
    vector -= vector.mean()
    norm = np.linalg.norm(vector)
    return vector / norm if norm else vector


def special_ref_vector(image) -> "np.ndarray":
    from PIL import Image, ImageFilter

    size = WEAPON_ICON_COMPARE_SIZE
    alpha = image.convert("RGBA").split()[3]
    side = round(size * SPECIAL_REF_SCALE)
    canvas = Image.new("L", (size, size), 0)
    canvas.paste(alpha.resize((side, side), Image.LANCZOS), ((size - side) // 2, (size - side) // 2))
    return _shape_vector(canvas.filter(ImageFilter.GaussianBlur(WEAPON_REF_BLUR)))


def special_icon_vector(icon) -> "np.ndarray":
    import numpy as np
    from PIL import Image

    size = WEAPON_ICON_COMPARE_SIZE
    return _shape_vector(np.asarray(icon.convert("RGB").resize((size, size), Image.LANCZOS)).max(axis=2))


def _best_match(vector, refs: dict, min_score: float, min_margin: float) -> str | None:
    if not refs:
        return None
    scores = sorted(((float(vector @ ref), key) for key, ref in refs.items()), reverse=True)
    best_score, best_key = scores[0]
    second_score = scores[1][0] if len(scores) > 1 else -1.0
    if best_score < min_score or best_score - second_score < min_margin:
        return None
    return best_key


def match_special(icon, refs: dict) -> str | None:
    """いちばん形が似ているスペシャル。似ていない・2 番目と差が無いなら None"""
    return _best_match(special_icon_vector(icon), refs, SPECIAL_MATCH_MIN_SCORE, SPECIAL_MATCH_MIN_MARGIN) if refs else None


def match_weapon(icon, refs: dict) -> str | None:
    """いちばん似ている参照画像のブキ。似ていない・2 番目と差が無いなら None（推測で記録しない）"""
    return _best_match(icon_vector(icon), refs, WEAPON_MATCH_MIN_SCORE, WEAPON_MATCH_MIN_MARGIN) if refs else None


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


def majority(values: list):
    """多数決（同数なら先に読めたもの）。None は数えない。何も無ければ None"""
    values = [v for v in values if v is not None]
    if not values:
        return None
    return max(values, key=lambda v: (values.count(v), -values.index(v)))


def read_cell_texts(cell, ocr_fn=None) -> list[str]:
    """セルをいくつかの読み方（倍率・白黒化）で読んだ文字列"""
    ocr_fn = ocr_fn or ocr
    readings = [lambda scale=scale: ocr_fn(cell, scale) for scale in CELL_OCR_SCALES]
    readings.append(lambda: ocr_fn(binarize_white_text(cell, CELL_OCR_SCALE), 1))
    return [" ".join(b.text for b in read()) for read in readings]


def vote_count(cell, ocr_fn=None) -> int | None:
    """セルの「x12」の数。読み方ごとの結果の多数決。どの読み方でも読めなければ None"""
    return majority([parse_count(text) for text in read_cell_texts(cell, ocr_fn)])



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


# 見出しの「Clear!!」/「Failure」は黄緑の文字。明るいステージの上では背景とまざって読めないので、黄緑の部分だけを取り出して読む
TITLE_GREEN_MIN = 180  # 緑の明るさ
TITLE_GREEN_MARGIN = (60, 80)  # 緑が赤・青よりどれだけ明るいか


def title_mask(image, scale: int):
    """黄緑の文字だけを、白地に黒い文字にする"""
    import numpy as np
    from PIL import Image, ImageOps

    r, g, b = (np.asarray(image.convert("RGB"), dtype=np.int32)[..., i] for i in range(3))
    is_title = (g > TITLE_GREEN_MIN) & (g - r > TITLE_GREEN_MARGIN[0]) & (g - b > TITLE_GREEN_MARGIN[1])
    mask = Image.fromarray(np.where(is_title, 0, 255).astype(np.uint8), "L")
    mask = mask.resize((image.width * scale, image.height * scale), Image.LANCZOS)
    return ImageOps.expand(mask, border=20, fill=255).convert("RGB")


def read_job(image, refs: dict, cells: SelfRowCells = SelfRowCells(), ocr_fn=ocr, boxes: list[Box] | None = None) -> tuple[dict, str]:
    """詳細画面の画像から、記録するバイト（NewSalmonJob）と日時を読む。読めない項目があれば ImportError_"""
    if boxes is None:
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
    header_boxes = [Box(b.text, 0, 0, 0, 0) for scale in HEADER_OCR_SCALES for b in ocr_fn(header, scale)]
    header_boxes += [Box(b.text, 0, 0, 0, 0) for scale in HEADER_OCR_SCALES for b in ocr_fn(title_mask(header, scale), 1)]
    job_kind = parse_job_kind(boxes)
    outcome = parse_outcome([b for b in boxes if b.y < row.y - 0.05] + header_boxes, max_wave_for(job_kind))
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
        stage = vote_stage(["".join(b.text for b in ocr_fn(crop, scale)) for scale in STAGE_OCR_SCALES] + [stage_box.text])
    cleared, wave = outcome
    job = {
        "goldenEggs": golden_eggs,
        "bossKills": boss_kills,
        "deaths": deaths,
        "cleared": cleared,
        "waveReached": wave,
        "stage": stage,
        "weapons": weapons,
        "jobKind": job_kind,
    }
    return job, played_at


# ---- バイトの詳細（上部・WAVE・プレイヤー）。読めない項目は推測せず None にする（詳細が読めなくても記録は続ける） ----

# 評価の名前（OCR の読み間違い「さんせつ」などを直すのに使う）
KNOWN_GRADES = ("かけだし", "はんにんまえ", "いちにんまえ", "じゅくれん", "たつじん", "たつじん+1", "たつじん+2", "たつじん+3", "でんせつ")
KNOWN_KINGS = ("ヨコヅナ", "タツ", "ジョー", "オカシラ連合")
WATER_LEVELS = ("干潮", "普通", "満潮")
# OCR が簡体字で読むことがある（满潮 など）
SIMPLIFIED_KANJI = str.maketrans({"满": "満", "现": "現"})
TEXT_MATCH_CUTOFF = 0.5
MAX_COUNT = 9999
MAX_HAZARD_LEVEL = 999


def closest(text: str, candidates: tuple[str, ...], cutoff: float = TEXT_MATCH_CUTOFF) -> str | None:
    text = normalize(text).translate(SIMPLIFIED_KANJI)
    if not text:
        return None
    match = get_close_matches(text, candidates, n=1, cutoff=cutoff)
    return match[0] if match else None


HAZARD_PATTERN = re.compile(r"(\d{1,3})\s*%")


def parse_hazard_level(text: str) -> int | None:
    """「キケン度333%」の 333"""
    match = HAZARD_PATTERN.search(normalize(text))
    return int(match.group(1)) if match and int(match.group(1)) <= MAX_HAZARD_LEVEL else None


# 空白で分かれていればそこで分ける。分かれていなければ「たつじん+2」の + の直後の 1 桁は名前に含める
GRADE_PATTERNS = (
    re.compile(r"^(\S+)\s+(\d{1,3})$"),
    re.compile(r"^(\D*\+\d)(\d{1,3})$"),
    re.compile(r"^(\D+?)(\d{1,3})$"),
)


def parse_grade(text: str) -> tuple[str | None, int | None]:
    """「でんせつ 999」→ ("でんせつ", 999)。名前は既知の評価に寄せる"""
    text = unicodedata.normalize("NFKC", text).strip()
    for pattern in GRADE_PATTERNS:
        match = pattern.match(text)
        if match:
            return closest(match.group(1), KNOWN_GRADES), int(match.group(2))
    return None, None


SCORE_PATTERN = re.compile(r"(\d{1,4})\s*[xX×]\s*(\d{1,2}\.\d{1,2})")


def parse_score_line(text: str) -> tuple[int | None, float | None]:
    """「130 x 3.25+」→ (バイトスコア, 評価レート)"""
    match = SCORE_PATTERN.search(normalize(text))
    return (int(match.group(1)), float(match.group(2))) if match else (None, None)


QUOTA_PATTERN = re.compile(r"(\d{1,3})\s*/\s*(\d{1,3})")


def parse_quota(text: str) -> tuple[int, int] | None:
    """「36/30」→ (納品数, ノルマ)"""
    match = QUOTA_PATTERN.search(normalize(text))
    return (int(match.group(1)), int(match.group(2))) if match else None


# 「<」を「c」「く」と読むことがある（x25c1>）ので、金イクラの数のすぐ後ろの、閉じの「>」まであるものだけを読む
ASSIST_PATTERN = re.compile(r"[xX×メ]\s*\d{1,4}\s*[<くcC〈(]\s*([0-9Il|]{1,3})\s*[>〉)]")


def parse_assist(text: str) -> int | None:
    """金イクラの「x12<8>」の <8>（アシスト）"""
    match = ASSIST_PATTERN.search(normalize(text))
    return int(match.group(1).translate(DIGIT_LOOKALIKES)) if match else None


def parse_points(text: str) -> int | None:
    """「472p」の 472"""
    match = re.search(r"(\d{1,4})\s*[pP]", normalize(text))
    return int(match.group(1)) if match else None


def boxes_in(boxes: list[Box], left: float, top: float, right: float, bottom: float) -> list[Box]:
    """中心が範囲内にある Box（左から）"""
    return sorted((b for b in boxes if left <= b.cx <= right and top <= b.cy <= bottom), key=lambda b: b.x)


# 「290%」の右端から左へ切り出す幅（「キケン度」の文字は入っても入らなくてもよい）
HAZARD_CELL_WIDTH = 0.15


def read_hazard_level(image, boxes: list[Box], ocr_fn=ocr) -> int | None:
    """キケン度（%）。全体の OCR では「キケン度」を「約」と読んで見つからなかったり、「285%」の 2 が抜けたりするので、
    「%」の付いた文字の右端から数字の部分を切り出し、何度か読んだ多数決にする"""
    # 「キケン度290%」のように 1 つに読めたものを優先し、無ければ「%」の付いた文字が 1 つだけのときに使う（ほかの「%」と取り違えない）
    percents = [b for b in boxes if b.cy < 0.3 and HAZARD_PATTERN.search(normalize(b.text))]
    labeled = [b for b in percents if "ケン" in normalize(b.text)]
    hazard = (labeled or (percents if len(percents) == 1 else [None]))[0] or find_box(boxes, "キケン", "ケン度", max_y=0.3)
    if hazard is None:
        return None
    right = hazard.x + hazard.w
    cell = crop_relative(image, (max(0.0, right - HAZARD_CELL_WIDTH), hazard.y - 0.006, min(1.0, right + 0.02), hazard.y + hazard.h + 0.006))
    return majority([parse_hazard_level(t) for t in read_cell_texts(cell, ocr_fn)])


EGGS_ROW_TOLERANCE = 0.01  # 同じ行とみなす高さの差
SCALES_BELOW_EGGS = 0.017  # イクラの行の中心から、ウロコの行の上端まで（評価の行が無いとき）
EGGS_RAISED_BELOW_LABEL = 0.03  # イクラの行がラベルからこれより近ければ、評価の行が無い（バイトチームコンテスト）


def read_header(image, boxes: list[Box], ocr_fn=ocr) -> dict:
    """詳細画面の上部（キケン度・評価・ポイント・チームのイクラ・ウロコ）"""
    hazard_level = read_hazard_level(image, boxes, ocr_fn)

    point_label = find_box(boxes, "獲得", "ポイント", "ホイント", max_y=0.35)
    grade_name = grade_point = job_point = job_score = job_rate = clear_bonus = None
    team_golden = team_power = None
    scales = [None, None, None]
    if point_label is not None:
        # 評価（左上）とポイント（右上）は「獲得ポイント」と同じ高さ
        for b in boxes_in(boxes, 0.0, point_label.cy - 0.02, 0.45, point_label.cy + 0.02):
            name, point = parse_grade(b.text)
            if name is not None:
                grade_name, grade_point = name, point
                break
        job_point = majority([parse_points(b.text) for b in boxes_in(boxes, 0.7, point_label.cy - 0.02, 1.0, point_label.cy + 0.02)])
        # 「130 x 3.25 + 50」はラベルの 0.045 下
        line = boxes_in(boxes, 0.5, point_label.cy + 0.03, 1.0, point_label.cy + 0.06)
        job_score, job_rate = parse_score_line(" ".join(b.text for b in line))
        after_plus = [b for b in line if b.x > 0.8 and re.fullmatch(r"\+?\s*\d{1,4}", normalize(b.text))]
        if after_plus:
            clear_bonus = int(re.sub(r"\D", "", normalize(after_plus[-1].text)))
        else:
            # 「+ 0」は「+」と同じ Box に入ることがある
            plus = re.search(r"\+\s*(\d{1,4})\s*$", normalize(" ".join(b.text for b in line)))
            clear_bonus = int(plus.group(1)) if plus else None
        # チームの金イクラ・赤イクラは左側の「x114 x3281」の行。評価の行があればラベルの 0.04 下、
        # バイトチームコンテスト（評価が無い）ではラベルの 0.02 下に上がるので、左側の数のうちいちばん上の行を使う
        counted = [(b, parse_count(b.text)) for b in boxes_in(boxes, 0.0, point_label.cy - 0.01, 0.45, point_label.cy + 0.06)]
        counted = [(b, n) for b, n in counted if n is not None]
        eggs_cy = min((b.cy for b, _ in counted), default=None)
        eggs = [n for b, n in counted if eggs_cy is not None and abs(b.cy - eggs_cy) < EGGS_ROW_TOLERANCE]
        if len(eggs) == 2:
            team_golden, team_power = eggs
        # ウロコ（銅・銀・金）はその下に 3 つ並ぶ。取れなかった「-」は None のまま
        # 評価の行がある画面は、ウロコの位置もラベルからの距離で決める（イクラの行の読み取り位置の揺れで、ウロコの切り出しがずれないように）
        raised = eggs_cy is not None and eggs_cy < point_label.cy + EGGS_RAISED_BELOW_LABEL
        top = eggs_cy + SCALES_BELOW_EGGS if raised else point_label.cy + 0.055
        for i, (left, right) in enumerate(((0.04, 0.17), (0.16, 0.28), (0.26, 0.4))):
            scales[i] = vote_count(crop_relative(image, (left, top, right, top + 0.022)), ocr_fn)
    return {
        "hazardLevel": hazard_level,
        "gradeName": grade_name,
        "gradePoint": grade_point,
        "jobPoint": job_point,
        "jobScore": job_score,
        "jobRate": job_rate,
        "clearBonus": clear_bonus,
        "teamGoldenEggs": team_golden,
        "teamPowerEggs": team_power,
        "scaleBronze": scales[0],
        "scaleSilver": scales[1],
        "scaleGold": scales[2],
    }


WAVE_HEADER_PATTERN = re.compile(r"^(EX-?WAVE|WAVE(\d))$")
# EX-WAVE は WAVE 6 として送る（バイトチームコンテストの WAVE 4・5 と重ならないように。lib/salmonBosses.ts の EX_WAVE）
EX_WAVE = 6
# WAVE の見出しの高さの範囲（バイトチームコンテストは WAVE 4・5 が 2 段目に並ぶ）
WAVE_HEADER_Y = (0.3, 0.7)
# 同じ段とみなす見出しの高さの差
WAVE_ROW_TOLERANCE = 0.03
# 次の段の見出しの、どれだけ上までをスペシャルの段とするか（次の段の GJ! をスペシャルとして数えないように）
NEXT_WAVE_ROW_MARGIN = 0.028
# WAVE が 1 つだけ（WAVE 1 で失敗）のときの列の幅
DEFAULT_WAVE_COLUMN_WIDTH = 0.24
# 列の中の各段の位置（WAVE の見出しの中心からの、画像の高さに対する比）
WAVE_QUOTA_ROW = (0.012, 0.045)
WAVE_WATER_ROW = (0.045, 0.072)
WAVE_EVENT_ROW = (0.068, 0.095)
WAVE_GOLDEN_ROW = (0.092, 0.117)  # 下に広げると「出現数」の上半分を数字の続きとして読む
WAVE_SPECIALS_ROW = (0.135, 0.19)
WAVE_RESULT_ROW = (-0.03, -0.006)  # 見出しの右上の GJ! / NG
# スペシャルのアイコンとみなす、外接矩形を埋める割合（角丸の四角）
MIN_SPECIAL_ICON_FILL = 0.85


def wave_headers(boxes: list[Box]) -> list[tuple[int, Box]]:
    """WAVE の見出し（WAVE 1〜5、EX-WAVE は EX_WAVE）。上の段から、左から"""
    headers = []
    for b in boxes:
        match = WAVE_HEADER_PATTERN.match(normalize(b.text).upper().replace("ー", "-"))
        if match and WAVE_HEADER_Y[0] < b.cy < WAVE_HEADER_Y[1]:
            wave = EX_WAVE if match.group(2) is None else int(match.group(2))
            if 1 <= wave <= TEAM_CONTEST_MAX_WAVE or wave == EX_WAVE:
                headers.append((wave, b))
    return sorted(headers, key=lambda h: (h[0] if h[0] != EX_WAVE else TEAM_CONTEST_MAX_WAVE + 1))


def wave_rows(headers: list[tuple[int, Box]]) -> list[list[tuple[int, Box]]]:
    """見出しを段ごとに分ける（上の段から、各段は左から）"""
    rows: list[list[tuple[int, Box]]] = []
    for header in sorted(headers, key=lambda h: h[1].cy):
        if rows and abs(rows[-1][0][1].cy - header[1].cy) < WAVE_ROW_TOLERANCE:
            rows[-1].append(header)
        else:
            rows.append([header])
    return [sorted(row, key=lambda h: h[1].x) for row in rows]


def wave_column_width(row: list[tuple[int, Box]]) -> float | None:
    """段の列の幅。見出しを 1 つ読み落としてもずれないよう、列の数ではなく WAVE の番号の差で割る（EX-WAVE は WAVE 3 の隣）"""
    def column(wave: int) -> int:
        return MAX_WAVE + 1 if wave == EX_WAVE else wave

    span = column(row[-1][0]) - column(row[0][0])
    return (row[-1][1].cx - row[0][1].cx) / span if span > 0 else None


def read_wave_result(image, left: float, right: float, header: Box, ocr_fn=ocr) -> bool | None:
    """見出しの右上の GJ!（True）/ NG（False）"""
    region = crop_relative(image, ((left + right) / 2, header.cy + WAVE_RESULT_ROW[0], right, header.cy + WAVE_RESULT_ROW[1]))
    texts = [re.sub(r"[^A-Z]", "", normalize(t).upper()) for t in read_cell_texts(region, ocr_fn)]
    return majority([True if "GJ" in t else False if "NG" in t else None for t in texts])


def count_special_icons(region) -> int:
    """WAVE の下に並ぶ、使われたスペシャルのアイコン（角丸の四角）の数"""
    return sum(1 for *_, fill in find_icon_blobs(region) if fill >= MIN_SPECIAL_ICON_FILL)


def read_waves(image, boxes: list[Box], ocr_fn=ocr) -> tuple[list[dict], str | None, bool | None]:
    """WAVE ごとの結果と、オカシラ（EX-WAVE）の名前・撃破したか"""
    rows = wave_rows(wave_headers(boxes))
    if not rows:
        return [], None, None
    widths = [w for row in rows if (w := wave_column_width(row)) is not None]
    waves = []
    king_name = king_defeated = None
    for i, row in enumerate(rows):
        # 見出しが 1 つだけの段は、ほかの段の列の幅を使う
        width = wave_column_width(row) or (widths[0] if widths else DEFAULT_WAVE_COLUMN_WIDTH)
        specials_bottom = rows[i + 1][0][1].cy - NEXT_WAVE_ROW_MARGIN if i + 1 < len(rows) else None
        for wave, header in row:
            detail, king = read_wave(image, boxes, wave, header, width, specials_bottom, ocr_fn)
            waves.append(detail)
            if king is not None:
                king_name, king_defeated = king
    waves.sort(key=lambda w: w["wave"])
    return waves, king_name, king_defeated


def read_wave(image, boxes: list[Box], wave: int, header: Box, width: float, specials_bottom: float | None, ocr_fn=ocr) -> tuple[dict, tuple | None]:
    """WAVE 1 列の結果と、EX-WAVE ならオカシラの（名前, 撃破したか）。specials_bottom は次の段の見出しより上で切るための下端"""
    left, right = header.cx - width / 2, header.cx + width / 2

    def band(row: tuple[float, float]) -> tuple[float, float, float, float]:
        return left, header.cy + row[0], right, header.cy + row[1]

    def texts(row: tuple[float, float]) -> list[str]:
        # 全体の OCR で読めた文字と、切り出して読み直した文字
        l, t, r, b = band(row)
        return [" ".join(x.text for x in boxes_in(boxes, l, t, r, b)), *read_cell_texts(crop_relative(image, (l + 0.01, t, r - 0.01, b)), ocr_fn)]

    quota = majority([parse_quota(t) for t in texts(WAVE_QUOTA_ROW)])
    water = majority([closest(t, WATER_LEVELS) for t in texts(WAVE_WATER_ROW)])
    event_texts = [normalize(t).translate(SIMPLIFIED_KANJI) for t in texts(WAVE_EVENT_ROW)]
    # イベントが無い WAVE は「-」で、OCR では何も読めないことが多い。日本語が読めたときだけイベントとする
    event = majority([t for t in event_texts if JAPANESE_PATTERN.search(t)]) or ""
    golden = majority([parse_count(t) for t in texts(WAVE_GOLDEN_ROW)])
    l, t, r, b = band(WAVE_SPECIALS_ROW)
    specials_region = crop_relative(image, (l, t, r, b if specials_bottom is None else min(b, specials_bottom)))
    specials_region.info["full_width"] = image.width
    detail = {
        "wave": wave,
        "delivered": quota[0] if quota and wave != EX_WAVE else None,
        "quota": quota[1] if quota and wave != EX_WAVE else None,
        "waterLevel": water,
        "event": event,
        "goldenAppearances": golden,
        "specialsUsed": count_special_icons(specials_region),
    }
    if wave != EX_WAVE:
        return detail, None
    # EX-WAVE は納品数の段にオカシラの名前が出る
    return detail, (majority([closest(t, KNOWN_KINGS) for t in texts(WAVE_QUOTA_ROW)]), read_wave_result(image, left, right, header, ocr_fn))


@dataclass(frozen=True)
class PlayerRowCells(SelfRowCells):
    """プレイヤーの行の数値の位置（SelfRowCells と同じく「オオモノシャケ」の Box が基準）"""

    # 右端を広げると、隣の被救助数のアイコンを数字として読む（x492 6）
    power_eggs: tuple[float, float, float, float] = (0.705, -0.01, 0.83, 0.032)
    rescues: tuple[float, float, float, float] = (0.88, -0.06, 0.95, -0.018)
    boss_kills: tuple[float, float, float, float] = (0.05, 0, 0.3, 0.035)
    # 名前は「オオモノシャケ」の上の帯
    name: tuple[float, float, float, float] = (0.04, -0.06, 0.48, -0.005)


def find_player_rows(boxes: list[Box]) -> list[Box]:
    """プレイヤーの行の「オオモノシャケ x24」（上から。いちばん上が自分）"""
    rows = sorted((b for b in boxes if b.cy >= 0.4 and "オオモノ" in normalize(b.text)), key=lambda b: b.y)
    return rows[:4]


def read_player(image, row: Box, position: int, refs: dict, special_refs: dict, cells: PlayerRowCells = PlayerRowCells(), ocr_fn=ocr) -> dict:
    ratio = image.width / image.height

    def cell(box: tuple[float, float, float, float]):
        left, top, right, bottom = box
        return crop_relative(image, (left, row.y + top * ratio, right, row.y + bottom * ratio))

    golden_texts = read_cell_texts(cell(cells.golden_eggs), ocr_fn)
    golden = majority([parse_count(t) for t in golden_texts])
    # アシストが 0 のときは <0> が表示されない
    assist = majority([parse_assist(t) for t in golden_texts])
    if assist is None and golden is not None:
        assist = 0
    boss_kills = parse_count(row.text)
    if boss_kills is None:
        boss_kills = vote_count(cell(cells.boss_kills), ocr_fn)
    name_boxes = ocr_fn(cell(cells.name), CELL_OCR_SCALE)
    name = normalize(" ".join(b.text for b in name_boxes)) or None

    left, top, right, bottom = cells.icons
    region = crop_relative(image, (left, row.y + top * ratio, right, row.y + bottom * ratio))
    region.info["full_width"] = image.width
    blobs = find_icon_blobs(region)
    weapons = [key for x, y, w, h, fill in blobs if fill < MAX_WEAPON_ICON_FILL and (key := match_weapon(region.crop((x, y, x + w, y + h)), refs))]
    specials = [match_special(region.crop((x, y, x + w, y + h)), special_refs) for x, y, w, h, fill in blobs if fill >= MAX_WEAPON_ICON_FILL]
    return {
        "position": position,
        "name": name,
        "bossKills": boss_kills,
        "goldenEggs": golden,
        "goldenAssists": assist,
        "powerEggs": vote_count(cell(cells.power_eggs), ocr_fn),
        "rescues": vote_count(cell(cells.rescues), ocr_fn),
        "rescued": vote_count(cell(cells.deaths), ocr_fn),
        "weapons": weapons,
        "special": specials[0] if specials else None,
    }


def read_details(image, boxes: list[Box], refs: dict, special_refs: dict, ocr_fn=ocr) -> dict:
    """詳細画面の上部・WAVE・プレイヤーの詳細（オオモノごとの数は別の画面なので read_bosses で読む）"""
    waves, king_name, king_defeated = read_waves(image, boxes, ocr_fn)
    players = [read_player(image, row, i, refs, special_refs, ocr_fn=ocr_fn) for i, row in enumerate(find_player_rows(boxes))]
    return {**read_header(image, boxes, ocr_fn), "kingName": king_name, "kingDefeated": king_defeated, "waves": waves, "players": players}


def describe_details(details: dict) -> str:
    """ログ用の詳細の要約。**味方の名前は出さない**（数だけ）"""
    waves = " ".join(f"W{w['wave']}:{w['delivered']}/{w['quota']}" for w in details["waves"])
    return f"キケン度 {details['hazardLevel']}% {waves} プレイヤー {len(details['players'])} 人"


def read_result(image, refs: dict, special_refs: dict, log=print) -> tuple[dict, str, dict | None]:
    """詳細画面から、記録するバイト・日時・詳細を読む。詳細は読めなくても記録を止めない（None にして警告する）"""
    boxes = ocr(image, FULL_OCR_SCALE)
    job, played_at = read_job(image, refs, boxes=boxes)
    try:
        details = read_details(image, boxes, refs, special_refs)
        log(f"詳細: {describe_details(details)}")
    except Exception as error:  # 詳細は「おまけ」なので、想定外の画面でも金イクラなどの記録は続ける
        log(f"警告: 詳細を読み取れませんでした: {error}")
        details = None
    return job, played_at, details


# ---- オオモノシャケの欄（詳細画面を下にスクロールした先） ----

# 「バクダン   4(3) / 出現数x4」（チームの討伐数・カッコ内が自分の討伐数（0 なら出ない）・出現数）。
# 出たオオモノだけが SALMON_BOSSES の順に並ぶ。オカシラが出たバイトでは一覧が 1 画面に収まらないので、
# 少しずつスクロールして撮り、オオモノの名前で突き合わせる
BOSS_NAME_X = (0.15, 0.3)  # オオモノの名前の左端（見出し・オカシラの名前は中央寄せなので外れる）
BOSS_VISIBLE_Y = (0.16, 0.84)  # 上のタイトル・下のボタンに隠れていない範囲（名前の中心）
MAX_PLAYERS = 4
BOSS_NAME_MAX_WIDTH = 0.2  # 下の「※カッコ内の数字は…」を名前として読み直さない
BOSS_NAME_HALF_HEIGHT = 0.018
BOSS_ROW_HALF_HEIGHT = 0.016
BOSS_KILLS_REGION = (0.6, 0.8)  # 「4(3) /」（スラッシュまで含める）
BOSS_APPEARANCES_REGION = (0.79, 0.95)  # 「出現数x4」
BOSS_LIST_END = "カッコ内"  # 一覧の下の「※カッコ内の数字は自分で倒した数です」
BOSS_SCROLL_PIXELS = -400  # 1 画面に見えるオオモノの行（0.16〜0.84）より短くして、取りこぼさない
BOSS_SCROLL_SETTLE_SECONDS = 0.5
# 読み終えたら先頭に戻す（最新のバイトで「最新のバイトへ」を押してもスクロールの位置は戻らない）
SCROLL_TO_TOP_PIXELS = 3000
MAX_BOSS_SCROLLS = 5
BOSS_NAME_MATCH_CUTOFF = 0.5
# 文字（白・黄）と背景（暗い赤・灰）を分ける明るさ
BOSS_TEXT_THRESHOLD = 150
# 文字の高さ（出現数の数字に対する比）。これより低いものは「出現数x」の文字
BOSS_SMALL_GLYPH_RATIO = 0.85
GLYPH_COMPARE_SIZE = (16, 10)  # (高さ, 幅)
# 数字・カッコの形との違い（0〜1。1 文字あたりの平均）。これより違うものは読めないとみなす
MAX_GLYPH_DISTANCE = 0.2


@cache
def load_boss_names() -> dict[str, str]:
    """lib/salmonBosses.ts のオオモノの画面の名前 → key（Node 24 の型除去で読む）"""
    script = (
        "const m = await import(process.argv[1]);"
        "console.log(JSON.stringify(Object.fromEntries(m.SALMON_BOSSES.map((b) => [b.name, b.key]))));"
    )
    result = subprocess.run(
        ["node", "--no-warnings", "--input-type=module", "-e", script, str(REPO_ROOT / "lib" / "salmonBosses.ts")],
        capture_output=True, text=True, check=True,
    )
    return json.loads(result.stdout)


def glyph_groups(cell) -> list:
    """セルの文字を、左から 1 文字ずつ（縦に文字の無い列で区切った、上下を詰めた 2 値の配列）"""
    import numpy as np

    ink = np.asarray(cell.convert("L")) > BOSS_TEXT_THRESHOLD
    columns = list(ink.any(axis=0)) + [False]
    glyphs, start = [], None
    for x, has_ink in enumerate(columns):
        if has_ink and start is None:
            start = x
        elif not has_ink and start is not None:
            rows = np.flatnonzero(ink[:, start:x].any(axis=1))
            glyphs.append(ink[rows[0]:rows[-1] + 1, start:x])
            start = None
    return glyphs


def is_slash(glyph) -> bool:
    """「/」か（上の端が右・下の端が左にある細い斜め線。7 は上の横棒が太いので外れる）"""
    import numpy as np

    height, width = glyph.shape
    top, bottom = np.flatnonzero(glyph[0]), np.flatnonzero(glyph[-1])
    if width < 4 or len(top) == 0 or len(bottom) == 0:
        return False
    return len(top) <= width / 2 and top.mean() - bottom.mean() >= width * 0.4


def _glyph_vector(glyph) -> "np.ndarray":
    """縦横比を保って高さをそろえ、幅は中央に置く（細い 1 を太らせない）"""
    import numpy as np
    from PIL import Image

    height, width = GLYPH_COMPARE_SIZE
    scaled = max(1, min(width, round(glyph.shape[1] * height / glyph.shape[0])))
    image = Image.fromarray(glyph.astype("uint8") * 255).resize((scaled, height), Image.BILINEAR)
    vector = np.zeros((height, width))
    left = (width - scaled) // 2
    vector[:, left:left + scaled] = np.asarray(image) / 255.0
    return vector


def _parse_glyph(text: str) -> "np.ndarray":
    import numpy as np

    return np.array([[c == "#" for c in row] for row in text.split("/")])


_GLYPH_TEMPLATES: list[tuple[str, "np.ndarray"]] = []


def glyph_templates() -> list[tuple[str, "np.ndarray"]]:
    """数字・カッコの形（digit_glyphs.py）"""
    if not _GLYPH_TEMPLATES:
        from digit_glyphs import GLYPHS

        _GLYPH_TEMPLATES.extend((char, _glyph_vector(_parse_glyph(text))) for char, texts in GLYPHS.items() for text in texts)
    return _GLYPH_TEMPLATES


def glyph_distances(glyph) -> dict[str, float]:
    """数字・カッコそれぞれの形との違い（0〜1。1 画素ずらしたものも比べて、いちばん近いもの）"""
    import numpy as np

    vector = _glyph_vector(glyph)
    shifted = [np.roll(np.roll(vector, dy, axis=0), dx, axis=1) for dy in (-1, 0, 1) for dx in (-1, 0, 1)]
    distances: dict[str, float] = {}
    for char, template in glyph_templates():
        distance = min(float(np.abs(s - template).mean()) for s in shifted)
        distances[char] = min(distances.get(char, 1.0), distance)
    return distances


DIGITS = "0123456789"


def read_digits(distances: list[dict[str, float]]) -> tuple[str, float]:
    """それぞれいちばん近い数字と、違いの合計"""
    best = [min(DIGITS, key=d.get) for d in distances]
    return "".join(best), sum(d[c] for d, c in zip(distances, best))


def read_kills(glyphs: list) -> tuple[int, int] | None:
    """「4(3)」「11」から (チームの討伐数, 自分の討伐数)。カッコの位置はすべての並び方を試し、形がいちばん合うものにする
    （1 文字ずつ決めると、細い「)」を「1」と読むことがある）"""
    distances = [glyph_distances(glyph) for glyph in glyphs]
    candidates = []
    if distances:
        candidates.append((read_digits(distances), None))
    # 数字 n 文字・「(」・数字 1 文字以上・「)」
    for n in range(1, len(distances) - 2):
        team, team_distance = read_digits(distances[:n])
        own, own_distance = read_digits(distances[n + 1:-1])
        paren_distance = distances[n]["("] + distances[-1][")"]
        candidates.append(((team, team_distance + own_distance + paren_distance), own))
    if not candidates:
        return None
    (team, distance), own = min(candidates, key=lambda c: c[0][1])
    if distance / len(glyphs) > MAX_GLYPH_DISTANCE:
        return None
    return int(team), int(own or 0)


def read_number(glyphs: list) -> int | None:
    if not glyphs:
        return None
    digits, distance = read_digits([glyph_distances(glyph) for glyph in glyphs])
    return int(digits) if distance / len(glyphs) <= MAX_GLYPH_DISTANCE else None


def parse_boss_counts(kills_cell, appearances_cell) -> tuple[int, int, int] | None:
    """「4(3) /」「出現数x4」から (出現数, チームの討伐数, 自分の討伐数)。読めなければ None"""
    glyphs = glyph_groups(kills_cell)
    slash = next((i for i, glyph in enumerate(glyphs) if is_slash(glyph)), None)
    if not slash:
        return None
    kills = read_kills(glyphs[:slash])

    # 「出現数x」の後ろの、大きい数字（「出現数x」の文字は数字より低い）
    appearance_glyphs = glyph_groups(appearances_cell)
    if kills is None or not appearance_glyphs:
        return None
    tallest = max(glyph.shape[0] for glyph in appearance_glyphs)
    digits = []
    for glyph in reversed(appearance_glyphs):
        if glyph.shape[0] <= tallest * BOSS_SMALL_GLYPH_RATIO:
            break
        digits.insert(0, glyph)
    appearances = read_number(digits)
    team, own = kills
    if appearances is None or not own <= team <= appearances:
        return None
    return appearances, team, own


def read_boss_rows(image, boxes: list[Box], names: dict[str, str], ocr_fn=ocr) -> dict[str, tuple[int, int, int]]:
    """画面に見えているオオモノの行。key → (出現数, チームの討伐数, 自分の討伐数)。読めない行は含めない"""
    rows = {}
    for box in boxes:
        if not (
            BOSS_NAME_X[0] <= box.x <= BOSS_NAME_X[1] and box.w <= BOSS_NAME_MAX_WIDTH and BOSS_VISIBLE_Y[0] <= box.cy <= BOSS_VISIBLE_Y[1]
        ):
            continue
        top, bottom = box.cy - BOSS_ROW_HALF_HEIGHT, box.cy + BOSS_ROW_HALF_HEIGHT
        name = closest(normalize(box.text), tuple(names), BOSS_NAME_MATCH_CUTOFF)
        if name is None:
            # 「ヘビ」は短く、全体の OCR では「4E」などと読むので、名前だけ切り出して読み直す
            cell = crop_relative(image, (BOSS_NAME_X[0], box.cy - BOSS_NAME_HALF_HEIGHT, BOSS_KILLS_REGION[0], box.cy + BOSS_NAME_HALF_HEIGHT))
            name = majority([closest(normalize(text), tuple(names), BOSS_NAME_MATCH_CUTOFF) for text in read_cell_texts(cell, ocr_fn)])
        if name is None:
            continue
        counts = parse_boss_counts(
            crop_relative(image, (BOSS_KILLS_REGION[0], top, BOSS_KILLS_REGION[1], bottom)),
            crop_relative(image, (BOSS_APPEARANCES_REGION[0], top, BOSS_APPEARANCES_REGION[1], bottom)),
        )
        if counts is not None:
            rows[names[name]] = counts
    return rows


def is_boss_list_end(boxes: list[Box]) -> bool:
    return any(BOSS_LIST_END in normalize(b.text) for b in boxes)


def merge_boss_rows(readings: list[dict[str, tuple[int, int, int]]], self_kills: int) -> list[dict] | None:
    """スクロールごとに読んだ行をまとめる（同じオオモノを何度か読んだら多数決）。
    自分の討伐数の合計が「オオモノシャケ xN」と合わなければ、読み間違い・取りこぼしとみなして None"""
    keys = list(dict.fromkeys(key for reading in readings for key in reading))
    bosses = []
    for key in keys:
        appearances, team, own = majority([reading[key] for reading in readings if key in reading])
        bosses.append({"boss": key, "appearances": appearances, "teamKills": team, "selfKills": own})
    if sum(b["selfKills"] for b in bosses) != self_kills:
        return None
    return bosses


def read_self_kills_on_scroll(boxes: list[Box]) -> int | None:
    """スクロールした画面に 4 人の行がすべて見えていれば、いちばん上（自分）の「オオモノシャケ xN」の数"""
    rows = sorted((b for b in boxes if b.x < BOSS_NAME_X[0] and "オオモノ" in normalize(b.text)), key=lambda b: b.y)
    return parse_count(rows[0].text) if len(rows) == MAX_PLAYERS else None


def is_single_digit_misread(read: int, reread: int) -> bool:
    """読み直した数が、1 文字だけの読み間違い（33 と 35 のように 1 桁だけ違う、17 と 1 のように 1 桁抜けた）で説明できるか。
    それ以上違うなら、どちらかの読み間違いが重なっているかもしれないので読み直しを採用しない"""
    a, b = str(read), str(reread)
    if a == b:
        return False
    if len(a) == len(b):
        return sum(x != y for x, y in zip(a, b)) == 1
    shorter, longer = sorted((a, b), key=len)
    return len(longer) - len(shorter) == 1 and any(longer[:i] + longer[i + 1:] == shorter for i in range(len(longer)))


def read_bosses(window: Window, capture_screen, self_kills: int, played_at: str, log=print) -> tuple[list[dict], int]:
    """詳細画面を少しずつ下にスクロールしてオオモノの欄を読み、先頭に戻す。capture_screen(label) は撮影して画像を返す。
    (オオモノごとの数, 記録する自分のオオモノの数) を返す。読めなければオオモノごとの数は空（記録は止めない）。

    - 自分の討伐数の合計が、詳細画面で読んだ「オオモノシャケ xN」と合わなければ、スクロールした画面に写る自分の行で読み直す。
      そちらと合えば、詳細画面の読み間違い（x33 を 35 など）とみなして、その数で記録する
    - 先頭に戻したら日時を読み直す。イカリング3の読み込みが遅れて、スクロールしている間に別のバイトに切り替わっていたら捨てる"""
    names = load_boss_names()
    readings = []
    rereads = []
    try:
        for _ in range(MAX_BOSS_SCROLLS):
            scroll(window, BOSS_SCROLL_PIXELS)
            time.sleep(BOSS_SCROLL_SETTLE_SECONDS)
            image = capture_screen("bosses")
            boxes = ocr(image, FULL_OCR_SCALE)
            readings.append(read_boss_rows(image, boxes, names))
            rereads.append(read_self_kills_on_scroll(boxes))
            if is_boss_list_end(boxes):
                break
        else:
            # 下の注記を読み間違えただけかもしれないので、読めた行で合計を突き合わせる
            log("警告: オオモノの欄の終わりが見つかりませんでした")
    finally:
        scroll(window, SCROLL_TO_TOP_PIXELS)

    time.sleep(BOSS_SCROLL_SETTLE_SECONDS)
    top = capture_screen("recheck")
    rechecked = read_played_at(top, ocr(top, FULL_OCR_SCALE))
    if rechecked is None:
        # 明るいステージでは日時が読めないことがある。切り替わったかは分からないので、合計の突き合わせに任せる
        log("警告: 先頭に戻した画面の日時が読めませんでした")
    elif rechecked != played_at:
        log("警告: オオモノの欄を読んでいる間に別のバイトに切り替わったので、オオモノごとの数は記録しません")
        return [], self_kills

    bosses = merge_boss_rows(readings, self_kills)
    if bosses is None:
        reread = majority(rereads)
        corrected = merge_boss_rows(readings, reread) if reread is not None and is_single_digit_misread(self_kills, reread) else None
        if corrected is None:
            log(f"警告: オオモノの欄の自分の討伐数の合計が x{self_kills} と合わないので、オオモノごとの数は記録しません")
            return [], self_kills
        log(f"オオモノシャケ x{self_kills} を x{reread} に読み直しました（オオモノの欄の合計と、スクロールした画面の自分の行が一致）")
        bosses, self_kills = corrected, reread
    log(f"オオモノ: {len(bosses)} 種・自分の討伐 {self_kills}")
    return bosses, self_kills


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

    def update(self, body: dict) -> tuple[int, dict]:
        """依頼の状態・結果を送り、HTTP のステータスと応答の本文（JSON でなければ空）を返す"""
        response = self.session.patch(self.import_url, json=body, timeout=10)
        try:
            payload = response.json()
        except ValueError:
            payload = {}
        return response.status_code, payload if isinstance(payload, dict) else {}

    def telop(self, text: str) -> None:
        try:
            self.session.post(self.telop_url, json={"text": text}, timeout=5)
        except Exception:  # テロップは知らせるだけなので、出せなくても取り込みは止めない
            pass


def capture_name(now: datetime, label: str) -> str:
    return f"{now.strftime('%Y%m%d-%H%M%S')}-{label}.png"


def process_request(request_id: int, api: Api, refs: dict, capture_dir: Path, log=print, special_refs: dict | None = None) -> None:
    if api.update({"id": request_id, "status": "processing"})[0] != 200:
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

            def capture_screen(label: str):
                nonlocal captures
                name = capture_name(datetime.now(), label)
                image = capture(window, capture_dir / name)
                captures = [*captures, name][-MAX_CAPTURES:]
                return image

            def read_current(label: str) -> tuple[dict, str, dict | None]:
                return read_result(capture_screen(label), refs, special_refs or {}, log)

            def add_bosses(job: dict, played_at: str, details: dict | None) -> None:
                """詳細が読めたバイトだけ、オオモノの欄も読む（詳細と同じく「おまけ」なので、失敗しても記録は続ける）。
                自分の「オオモノシャケ xN」を読み直したら、バイトと自分の行の数も直す"""
                if details is None:
                    return
                try:
                    details["bosses"], boss_kills = read_bosses(window, capture_screen, job["bossKills"], played_at, log)
                except Exception as error:
                    log(f"警告: オオモノの欄を読み取れませんでした: {error}")
                    return
                job["bossKills"] = boss_kills
                for player in details.get("players", []):
                    if player.get("position") == 0:
                        player["bossKills"] = boss_kills

            job, played_at, details = read_current("detail")
            log(f"読み取り: {played_at} {job}")
            if played_at in recorded:
                if time.monotonic() + RETRY_INTERVAL_SECONDS > deadline:
                    raise ImportError_("新しいバイトがイカリング3に反映されませんでした（最新のバイトは記録済みです）")
                log(f"{played_at} のバイトは記録済みです。イカリング3への反映を待って読み直します")
                time.sleep(RETRY_INTERVAL_SECONDS)
                continue

            add_bosses(job, played_at, details)
            jobs = [{"job": job, "playedAt": played_at, "details": details}]
            # 取りこぼしを遡る。読めないバイトがあればそこでやめ、読めた分だけ記録する
            while len(jobs) < MAX_BACKFILL_JOBS and open_previous_job(window, played_at):
                try:
                    previous_job, previous_played_at, previous_details = read_current("detail")
                except ImportError_ as error:
                    log(f"警告: 前のバイトを読み取れなかったので、遡るのをやめます: {error}")
                    break
                if previous_played_at in {j["playedAt"] for j in jobs} or should_stop_backfill(
                    previous_played_at, recorded, session_started_at
                ):
                    break
                log(f"取りこぼし: {previous_played_at} {previous_job}")
                add_bosses(previous_job, previous_played_at, previous_details)
                jobs.append({"job": previous_job, "playedAt": previous_played_at, "details": previous_details})
                played_at = previous_played_at

            status, body = api.update({"id": request_id, "status": "succeeded", "jobs": jobs[::-1], "captures": captures})
            if status == 200:
                log(f"依頼 {request_id}: {len(jobs)} 件記録しました")
                # 本日の最高記録などが出たら、サーバーがお祝いのテロップを出している（上書きしないように知らせない）
                if not body.get("celebrated"):
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
            captures = [*captures, name][-MAX_CAPTURES:]
        except Exception:
            pass
    api.update({"id": request_id, "status": "failed", "error": reason, "captures": captures})
    api.telop(TELOP_FAILED)


def run(api_base: str, capture_dir: Path, refs_dir: Path) -> None:
    api = Api(api_base)
    if not has_accessibility_permission():
        print(f"[salmon-result] 警告: {ACCESSIBILITY_ERROR}", file=sys.stderr, flush=True)
    refs = ensure_weapon_refs(refs_dir)
    special_refs = ensure_special_refs(refs_dir)
    print(f"[salmon-result] 参照画像: ブキ {len(refs)} 種・スペシャル {len(special_refs)} 種。{api.import_url} の依頼を待っています", flush=True)
    attempted: set[int] = set()
    warned = False
    while True:
        try:
            for request in api.pending():
                if request["id"] in attempted:
                    continue
                attempted.add(request["id"])  # 結果を送れなくても、同じ依頼を何度も操作しない
                process_request(
                    request["id"], api, refs, capture_dir, log=lambda m: print(f"[salmon-result] {m}", flush=True), special_refs=special_refs,
                )
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

    if path.stem.endswith("-bosses") or path.stem.startswith("bosses-"):
        # オオモノの欄のキャプチャは、見えている行だけを表示する（合計の突き合わせは取り込みのときにする）
        with Image.open(path) as image:
            image = image.convert("RGB")
            boxes = ocr(image, FULL_OCR_SCALE)
            rows = read_boss_rows(image, boxes, load_boss_names())
        bosses = [{"boss": key, "appearances": a, "teamKills": t, "selfKills": o} for key, (a, t, o) in rows.items()]
        print(json.dumps({"bosses": bosses, "endOfList": is_boss_list_end(boxes)}, ensure_ascii=False, indent=2))
        return
    with Image.open(path) as image:
        job, played_at, details = read_result(
            image.convert("RGB"), ensure_weapon_refs(refs_dir), ensure_special_refs(refs_dir), log=lambda m: print(m, file=sys.stderr),
        )
    if details:
        # 配信中のターミナルに映っても困らないよう、味方の名前は文字数だけにする
        for player in details["players"]:
            player["name"] = None if player["name"] is None else f"（{len(player['name'])} 文字）"
    print(json.dumps({"playedAt": played_at, **job, "details": details}, ensure_ascii=False, indent=2))


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
