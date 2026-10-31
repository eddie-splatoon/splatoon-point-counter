"""マイク音声をリアルタイムに文字起こしし、/api/caption へ送信するスクリプト。

Silero VAD で発話を区切り、発話ごとに mlx-whisper (Apple Silicon) で文字起こしする。
発話がテロップのプリセットに近ければ、字幕の代わりに /api/telop でそのテロップを出す。
決まった言葉（「ナイス」など）を含めば、/api/stream-data でスコア表示オーバーレイにエフェクトを出す。
"""

import argparse
import os
import queue
import re
import sys
import time
import unicodedata
import wave
from collections import deque
from difflib import SequenceMatcher
from functools import partial
from pathlib import Path
from urllib.parse import urljoin

SAMPLE_RATE = 16000
CHUNK_SAMPLES = 512  # Silero VAD が 16kHz で受け付けるチャンクサイズ
PRE_ROLL_CHUNKS = 10  # 発話開始直前の約0.3秒も含めて文字起こしする
MAX_SEGMENT_SECONDS = 15  # 長く話し続けた場合でもこの長さで区切って送信する
MIN_SEGMENT_SECONDS = 0.4  # これより短い発話（相づち・物音）は文字起こししない
MIN_SILENCE_MS = 500  # この長さ黙ったら発話の終わりとみなす

DEFAULT_CAPTION_URL = "http://localhost:3000/api/caption"
DEFAULT_WHISPER_MODEL = "mlx-community/whisper-large-v3-turbo"

# スプラ用語の聞き間違いを減らすため Whisper に渡す用語集。
# Whisper はプロンプトが長すぎると先頭から切り捨てるので、テロップの文より後ろ（切り捨てられにくい側）に置く
GLOSSARY = (
    "スプラトゥーン3のサーモンラン。バイト、金イクラ、納品、オオモノシャケ、カタパッド、テッパン、"
    "バクダン、ヘビ、タワー、モグラ、コウモリ、ハシラ、ダイバー、テッキュウ、ナベブタ、トキシラズ、"
    "満潮、干潮、ラッシュ、グリル、霧、ドスコイ、ヨコヅナ、タツ、ジョー、オカシラ、カンスト、野良、WAVE。"
)

# セグメントの信頼度のしきい値。除外したものはログに出るので、それを見て調整する
MIN_AVG_LOGPROB = -0.8
MAX_NO_SPEECH_PROB = 0.5
MAX_COMPRESSION_RATIO = 2.4

# 無音やノイズに対して Whisper が出力しがちな定番の幻聴（完全一致のみ除外する）
HALLUCINATIONS = {
    "ご視聴ありがとうございました",
    "ご清聴ありがとうございました",
    "最後までご視聴いただきありがとうございました",
    "チャンネル登録よろしくお願いします",
    "字幕視聴ありがとうございました",
}

# 字幕にしても意味のない相づち（記号・長音を除き、ひらがなにそろえてから完全一致で比べる）
FILLERS = {"あっ", "えっ", "おっ", "わっ", "うっ", "んっ", "うん", "ううん", "ええ", "はい", "うわ", "へえ", "ほう", "おお", "んん"}

# 英字 3 文字以上の単語は幻聴として除外するが、ゲームでよく言うものは通す（大文字で比べる）
ALLOWED_LATIN = {"WAVE", "EXTRA", "GOOD", "NICE", "HELP", "LOL"}

TELOP_MATCH_THRESHOLD = 0.8  # 発話とテロップの類似度がこれ以上なら一致とみなす
TELOP_SHORT_LENGTH = 2  # 正規化後この文字数以下のテロップは完全一致のときだけ出す
TELOP_REFRESH_SECONDS = 30  # テロップのプリセットを取り直す間隔
TELOP_COOLDOWN_SECONDS = 10  # 同じテロップを出し直さない時間

# 話した言葉で出すエフェクト（/api/stream-data の lastEvent.name）。上から順に見て、最初に含まれていたものを出す
EFFECT_KEYWORDS = [
    ("STAR", ("ナイス",)),
    ("LOVE", ("ありがとう",)),
    ("SPARKLE", ("よっしゃ",)),
    ("BUBBLE", ("やべ", "やば")),
]

_PUNCTUATION = re.compile(r"[\s、。．，,.!！?？…・「」『』（）()\-ー〜~]+")
_LATIN_WORD = re.compile(r"[A-Za-z]+")


def _to_hiragana(text: str) -> str:
    return "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in text)


def normalize_for_match(text: str) -> str:
    """表記ゆれを吸収して比べるための形にする（全角半角・カタカナとひらがな・記号と長音の違いを無視）。"""
    return _PUNCTUATION.sub("", _to_hiragana(unicodedata.normalize("NFKC", text))).lower()


def _is_japanese_or_ascii(char: str) -> bool:
    return (
        char.isascii()
        or "぀" <= char <= "ヿ"  # ひらがな・カタカナ
        or "㐀" <= char <= "鿿"  # 漢字
        or "豈" <= char <= "﫿"  # 互換漢字
        or char in "々〆ヵヶ"
    )


def caption_rejection(text: str) -> str | None:
    """字幕として表示すべきでない理由を返す。表示してよければ None。"""
    normalized = _PUNCTUATION.sub("", unicodedata.normalize("NFKC", text))
    if not normalized:
        return "空"
    if normalized in HALLUCINATIONS:
        return "定番の幻聴"
    if any(unicodedata.category(c).startswith("L") and not _is_japanese_or_ascii(c) for c in normalized):
        return "日本語以外の文字"
    if any(len(w) >= 3 and w.upper() not in ALLOWED_LATIN for w in _LATIN_WORD.findall(normalized)):
        return "英単語"
    if len(normalized) <= 1 or _to_hiragana(normalized) in FILLERS:
        return "相づち"
    return None


def is_valid_caption(text: str) -> bool:
    """字幕として表示すべきテキストかを判定する。"""
    return caption_rejection(text) is None


def segment_rejection(segment: dict) -> str | None:
    """Whisper のセグメントの信頼度が低ければ理由を返す。"""
    if segment.get("no_speech_prob", 0.0) > MAX_NO_SPEECH_PROB:
        return f"無音らしさ {segment['no_speech_prob']:.2f}"
    if segment.get("avg_logprob", 0.0) < MIN_AVG_LOGPROB:
        return f"信頼度 {segment['avg_logprob']:.2f}"
    if segment.get("compression_ratio", 0.0) > MAX_COMPRESSION_RATIO:
        return f"繰り返し {segment['compression_ratio']:.2f}"
    return None


def select_segments(segments: list[dict]) -> tuple[str, list[tuple[str, str]]]:
    """信頼度の低いセグメントを除いて連結する。(残った文, [(除外理由, 除外した文)]) を返す。"""
    kept: list[str] = []
    rejected: list[tuple[str, str]] = []
    for segment in segments:
        text = str(segment.get("text", "")).strip()
        if not text:
            continue
        reason = segment_rejection(segment)
        if reason:
            rejected.append((reason, text))
        else:
            kept.append(text)
    return "".join(kept), rejected


def build_prompt(telop_texts: list[str]) -> str:
    """Whisper に渡すプロンプト。配信者が実際に言うテロップの文と用語集。"""
    return "".join(f"{t}。" for t in telop_texts) + GLOSSARY


def match_telop(text: str, presets: list[dict]) -> dict | None:
    """発話に最も近いテロップのプリセットを返す。十分に近いものが無ければ None。"""
    spoken = normalize_for_match(text)
    if not spoken:
        return None
    best, best_score = None, 0.0
    for preset in presets:
        target = normalize_for_match(str(preset.get("text", "")))
        if not target:
            continue
        if len(target) <= TELOP_SHORT_LENGTH:
            score = 1.0 if spoken == target else 0.0
        elif target in spoken and len(target) * 2 >= len(spoken):
            # 「ナイス！いいね」→「ナイス!」。長い発話の一部に含まれるだけ（「ナイスって言ってる場合じゃない…」）では出さない
            score = 1.0
        else:
            score = SequenceMatcher(None, spoken, target).ratio()
        if score >= TELOP_MATCH_THRESHOLD and score > best_score:
            best, best_score = preset, score
    return best


def match_effect(text: str) -> str | None:
    """発話に含まれるキーワードに対応するエフェクトを返す。無ければ None。"""
    spoken = normalize_for_match(text)
    for effect, keywords in EFFECT_KEYWORDS:
        if any(normalize_for_match(k) in spoken for k in keywords):
            return effect
    return None


class TelopMatcher:
    """テロップのプリセットを定期的に取得し、発話に近いものがあればテロップを出す。"""

    def __init__(self, url: str, fetch_presets, show_telop, clock=time.monotonic):
        self.url = url
        self._fetch_presets = fetch_presets
        self._show_telop = show_telop
        self._clock = clock
        self.presets: list[dict] = []
        self._fetched_at: float | None = None
        self._shown_at: dict[int, float] = {}

    def refresh(self) -> None:
        """前回の取得から時間が経っていればプリセットを取り直す。失敗したら前回の値のまま（字幕は止めない）。"""
        now = self._clock()
        if self._fetched_at is not None and now - self._fetched_at < TELOP_REFRESH_SECONDS:
            return
        self._fetched_at = now
        try:
            self.presets = self._fetch_presets(self.url)
        except Exception as e:  # noqa: BLE001 - テロップが取れなくても字幕は続ける
            print(f"[caption-stt] テロップのプリセットを取得できませんでした: {e}", file=sys.stderr)

    def try_show(self, text: str) -> dict | None:
        """発話に近いテロップを出す。出したらそのプリセットを返す（その発話は字幕に送らない）。"""
        preset = match_telop(text, self.presets)
        if preset is None:
            return None
        now = self._clock()
        last = self._shown_at.get(preset["id"])
        if last is not None and now - last < TELOP_COOLDOWN_SECONDS:
            return preset  # 出したばかりなので出し直さないが、字幕にも送らない
        try:
            self._show_telop(self.url, preset["id"])
        except Exception as e:  # noqa: BLE001 - 出せなかったら字幕として送る
            print(f"[caption-stt] テロップを出せませんでした: {e}", file=sys.stderr)
            return None
        self._shown_at[preset["id"]] = now
        return preset


def default_telop_url(caption_url: str) -> str:
    return urljoin(caption_url, "/api/telop")


def default_effect_url(caption_url: str) -> str:
    return urljoin(caption_url, "/api/stream-data")


def trigger_effect(url: str, effect: str) -> None:
    import requests

    try:
        requests.patch(url, json={"event": effect}, timeout=3).raise_for_status()
    except requests.RequestException as e:
        print(f"[caption-stt] エフェクトを出せませんでした: {e}", file=sys.stderr)


def fetch_telop_presets(url: str) -> list[dict]:
    import requests

    response = requests.get(url, timeout=3)
    response.raise_for_status()
    presets = response.json().get("presets", [])
    return [p for p in presets if isinstance(p, dict) and isinstance(p.get("id"), int) and isinstance(p.get("text"), str)]


def telop_request(preset_id: int, speak: bool) -> dict:
    """テロップを出すリクエストの本文。speak なら読み上げはプリセットの設定に従い、そうでなければ読み上げない。"""
    # 既定では読み上げない（配信者が言った直後に同じ文を合成音声で読むと重なるため）。
    # 無言配信など声が配信に乗らないときは TELOP_SPEAK=on で、読み上げを声の代わりにする
    return {"presetId": preset_id} if speak else {"presetId": preset_id, "speak": False}


def show_telop(url: str, preset_id: int, speak: bool = False) -> None:
    import requests

    requests.post(url, json=telop_request(preset_id, speak), timeout=3).raise_for_status()


def list_devices() -> None:
    import sounddevice as sd

    print(sd.query_devices())


def post_caption(url: str, text: str) -> None:
    import requests

    try:
        requests.post(url, json={"text": text}, timeout=3).raise_for_status()
    except requests.RequestException as e:
        print(f"[caption-stt] 送信に失敗しました: {e}", file=sys.stderr)


def transcribe(audio, model: str, prompt: str | None = None) -> list[dict]:
    """音声を文字起こしし、セグメントの一覧を返す。"""
    import mlx_whisper

    result = mlx_whisper.transcribe(
        audio,
        path_or_hf_repo=model,
        language="ja",
        condition_on_previous_text=False,
        initial_prompt=prompt,
    )
    return list(result.get("segments", []))


def save_sample(directory: Path, audio, text: str) -> None:
    """発話の音声（16kHz/16bit の wav）と、そのときの文字起こし結果を保存する（モデルの比較用）。"""
    import numpy as np

    directory.mkdir(parents=True, exist_ok=True)
    stem = time.strftime("%Y%m%d-%H%M%S") + f"-{int(time.time() * 1000) % 1000:03d}"
    with wave.open(str(directory / f"{stem}.wav"), "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(SAMPLE_RATE)
        f.writeframes((np.clip(audio, -1.0, 1.0) * 32767).astype(np.int16).tobytes())
    (directory / f"{stem}.txt").write_text(text + "\n", encoding="utf-8")


def load_sample(path: Path):
    import numpy as np

    with wave.open(str(path), "rb") as f:
        return np.frombuffer(f.readframes(f.getnframes()), dtype=np.int16).astype(np.float32) / 32768


def describe(segments: list[dict]) -> str:
    """文字起こし結果と、字幕にするかの判定を 1 行にする。"""
    text, rejected = select_segments(segments)
    parts = [f"(除外: {reason}) {t}" for reason, t in rejected]
    if text:
        reason = caption_rejection(text)
        parts.append(f"(除外: {reason}) {text}" if reason else text)
    return " / ".join(parts) or "(なし)"


def compare(directory: Path, models: list[str], prompt: str) -> None:
    """保存した発話の音声を、モデルごとに文字起こしして並べて表示する。"""
    paths = sorted(directory.glob("*.wav"))
    if not paths:
        print(f"[caption-stt] {directory} に wav がありません", file=sys.stderr)
        return
    samples = [load_sample(p) for p in paths]
    results: dict[str, list[tuple[str, float]]] = {}
    for model in models:
        print(f"[caption-stt] モデルを読み込んでいます: {model}")
        transcribe(samples[0][:SAMPLE_RATE], model, prompt)  # 読み込み時間を処理時間に含めない
        results[model] = []
        for audio in samples:
            started = time.perf_counter()
            line = describe(transcribe(audio, model, prompt))
            results[model].append((line, time.perf_counter() - started))

    for i, path in enumerate(paths):
        recorded = path.with_suffix(".txt")
        print(f"\n## {path.name}" + (f"（録音時: {recorded.read_text(encoding='utf-8').strip()}）" if recorded.exists() else ""))
        for model in models:
            line, seconds = results[model][i]
            print(f"  {model} [{seconds:.2f}s] {line}")


def parse_device(value: str | None) -> int | str | None:
    """MIC_DEVICE をデバイス番号（数字）またはデバイス名の一部として解釈する。"""
    if not value:
        return None
    return int(value) if value.isdigit() else value


def run(
    caption_url: str,
    model: str,
    device: int | str | None,
    telop: TelopMatcher | None,
    effect_url: str | None,
    save_dir: Path | None,
) -> None:
    import numpy as np
    import sounddevice as sd
    import torch
    from silero_vad import VADIterator, load_silero_vad

    vad = VADIterator(load_silero_vad(), sampling_rate=SAMPLE_RATE, min_silence_duration_ms=MIN_SILENCE_MS)
    chunks: queue.Queue = queue.Queue()

    def callback(indata, _frames, _time, status):
        if status:
            print(f"[caption-stt] {status}", file=sys.stderr)
        chunks.put(indata[:, 0].copy())

    def prompt() -> str:
        if telop is None:
            return GLOSSARY
        telop.refresh()
        return build_prompt([p["text"] for p in telop.presets])

    # 初回のモデルダウンロードとロードを起動時に済ませる
    print(f"[caption-stt] モデルを読み込んでいます: {model}")
    transcribe(np.zeros(SAMPLE_RATE, dtype=np.float32), model)

    pre_roll: deque = deque(maxlen=PRE_ROLL_CHUNKS)
    segment: list = []
    speaking = False
    max_chunks = MAX_SEGMENT_SECONDS * SAMPLE_RATE // CHUNK_SAMPLES
    # 発話には直前の音声（pre_roll）と、終わりと判定されるまでの無音も入っているので、それを除いた長さで比べる
    min_chunks = int((MIN_SEGMENT_SECONDS + MIN_SILENCE_MS / 1000) * SAMPLE_RATE / CHUNK_SAMPLES) + PRE_ROLL_CHUNKS

    def flush(ended: bool):
        if ended and len(segment) < min_chunks:
            return
        audio = np.concatenate(segment)
        try:
            segments = transcribe(audio, model, prompt())
        except Exception as e:  # noqa: BLE001 - 配信中は一時的なエラーで常駐プロセスを止めない
            print(f"[caption-stt] 文字起こしに失敗しました: {e}", file=sys.stderr)
            return
        text, rejected = select_segments(segments)
        for reason, rejected_text in rejected:
            print(f"[caption-stt] (除外: {reason}) {rejected_text}")
        if save_dir is not None:
            save_sample(save_dir, audio, describe(segments))
        if not text:
            return
        reason = caption_rejection(text)
        if reason:
            print(f"[caption-stt] (除外: {reason}) {text}")
            return
        # エフェクトは字幕・テロップとは別に出す（「ナイス」ならテロップとエフェクトの両方）
        effect = match_effect(text) if effect_url else None
        if effect:
            print(f"[caption-stt] (エフェクト: {effect}) {text}")
            trigger_effect(effect_url, effect)
        preset = telop.try_show(text) if telop else None
        if preset:
            print(f"[caption-stt] (テロップ: {preset['text']}) {text}")
            return
        print(f"[caption-stt] {text}")
        post_caption(caption_url, text)

    with sd.InputStream(
        samplerate=SAMPLE_RATE,
        blocksize=CHUNK_SAMPLES,
        channels=1,
        dtype="float32",
        device=device,
        callback=callback,
    ):
        print(f"[caption-stt] 聞き取りを開始しました（送信先: {caption_url}）。Ctrl+C で終了します。")
        while True:
            chunk = chunks.get()
            event = vad(torch.from_numpy(chunk))

            if speaking:
                segment.append(chunk)
            else:
                pre_roll.append(chunk)

            if event and "start" in event and not speaking:
                speaking = True
                segment = list(pre_roll)
                pre_roll.clear()
            elif speaking and ((event and "end" in event) or len(segment) >= max_chunks):
                flush(ended=bool(event and "end" in event))
                segment = []
                if event and "end" in event:
                    speaking = False
                    vad.reset_states()


def main() -> None:
    parser = argparse.ArgumentParser(description="マイク音声を文字起こしして字幕オーバーレイへ送信します。")
    parser.add_argument("--list-devices", action="store_true", help="利用可能なオーディオデバイスを表示して終了する")
    parser.add_argument("--compare", metavar="DIR", help="CAPTION_SAVE_DIR に保存した音声をモデルごとに文字起こしして比べる")
    parser.add_argument("--models", help="--compare で比べるモデル（カンマ区切り。既定は WHISPER_MODEL）")
    args = parser.parse_args()

    if args.list_devices:
        list_devices()
        return

    caption_url = os.environ.get("CAPTION_URL", DEFAULT_CAPTION_URL)
    model = os.environ.get("WHISPER_MODEL", DEFAULT_WHISPER_MODEL)
    telop_url = os.environ.get("TELOP_URL") or default_telop_url(caption_url)
    telop = None if os.environ.get("TELOP_MATCH") == "off" else TelopMatcher(
        telop_url, fetch_telop_presets, partial(show_telop, speak=os.environ.get("TELOP_SPEAK") == "on")
    )
    effect_url = None if os.environ.get("EFFECT_MATCH") == "off" else (os.environ.get("EFFECT_URL") or default_effect_url(caption_url))

    if args.compare:
        models = [m.strip() for m in (args.models or model).split(",") if m.strip()]
        texts = []
        if telop:
            telop.refresh()
            texts = [p["text"] for p in telop.presets]
        compare(Path(args.compare), models, build_prompt(texts))
        return

    save_dir = os.environ.get("CAPTION_SAVE_DIR")
    try:
        run(
            caption_url=caption_url,
            model=model,
            device=parse_device(os.environ.get("MIC_DEVICE")),
            telop=telop,
            effect_url=effect_url,
            save_dir=Path(save_dir) if save_dir else None,
        )
    except KeyboardInterrupt:
        print("\n[caption-stt] 終了しました。")


if __name__ == "__main__":
    main()
