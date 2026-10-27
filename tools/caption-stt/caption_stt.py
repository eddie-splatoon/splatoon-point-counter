"""マイク音声をリアルタイムに文字起こしし、/api/caption へ送信するスクリプト。

Silero VAD で発話を区切り、発話ごとに mlx-whisper (Apple Silicon) で文字起こしする。
"""

import argparse
import os
import queue
import re
import sys
from collections import deque

SAMPLE_RATE = 16000
CHUNK_SAMPLES = 512  # Silero VAD が 16kHz で受け付けるチャンクサイズ
PRE_ROLL_CHUNKS = 10  # 発話開始直前の約0.3秒も含めて文字起こしする
MAX_SEGMENT_SECONDS = 15  # 長く話し続けた場合でもこの長さで区切って送信する

DEFAULT_CAPTION_URL = "http://localhost:3000/api/caption"
DEFAULT_WHISPER_MODEL = "mlx-community/whisper-large-v3-turbo"

# 無音やノイズに対して Whisper が出力しがちな定番の幻聴（完全一致のみ除外する）
HALLUCINATIONS = {
    "ご視聴ありがとうございました",
    "ご清聴ありがとうございました",
    "最後までご視聴いただきありがとうございました",
    "チャンネル登録よろしくお願いします",
    "字幕視聴ありがとうございました",
}

_PUNCTUATION = re.compile(r"[\s、。．，,.!！?？…・「」『』（）()\-ー〜~]+")


def is_valid_caption(text: str) -> bool:
    """字幕として表示すべきテキストかを判定する。"""
    normalized = _PUNCTUATION.sub("", text)
    if not normalized:
        return False
    return normalized not in HALLUCINATIONS


def list_devices() -> None:
    import sounddevice as sd

    print(sd.query_devices())


def post_caption(url: str, text: str) -> None:
    import requests

    try:
        requests.post(url, json={"text": text}, timeout=3).raise_for_status()
    except requests.RequestException as e:
        print(f"[caption-stt] 送信に失敗しました: {e}", file=sys.stderr)


def transcribe(audio, model: str) -> str:
    import mlx_whisper

    result = mlx_whisper.transcribe(
        audio,
        path_or_hf_repo=model,
        language="ja",
        condition_on_previous_text=False,
    )
    return str(result.get("text", "")).strip()


def parse_device(value: str | None) -> int | str | None:
    """MIC_DEVICE をデバイス番号（数字）またはデバイス名の一部として解釈する。"""
    if not value:
        return None
    return int(value) if value.isdigit() else value


def run(caption_url: str, model: str, device: int | str | None) -> None:
    import numpy as np
    import sounddevice as sd
    import torch
    from silero_vad import VADIterator, load_silero_vad

    vad = VADIterator(load_silero_vad(), sampling_rate=SAMPLE_RATE, min_silence_duration_ms=500)
    chunks: queue.Queue = queue.Queue()

    def callback(indata, _frames, _time, status):
        if status:
            print(f"[caption-stt] {status}", file=sys.stderr)
        chunks.put(indata[:, 0].copy())

    # 初回のモデルダウンロードとロードを起動時に済ませる
    print(f"[caption-stt] モデルを読み込んでいます: {model}")
    transcribe(np.zeros(SAMPLE_RATE, dtype=np.float32), model)

    pre_roll: deque = deque(maxlen=PRE_ROLL_CHUNKS)
    segment: list = []
    speaking = False
    max_chunks = MAX_SEGMENT_SECONDS * SAMPLE_RATE // CHUNK_SAMPLES

    def flush():
        audio = np.concatenate(segment)
        try:
            text = transcribe(audio, model)
        except Exception as e:  # noqa: BLE001 - 配信中は一時的なエラーで常駐プロセスを止めない
            print(f"[caption-stt] 文字起こしに失敗しました: {e}", file=sys.stderr)
            return
        if is_valid_caption(text):
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
                flush()
                segment = []
                if event and "end" in event:
                    speaking = False
                    vad.reset_states()


def main() -> None:
    parser = argparse.ArgumentParser(description="マイク音声を文字起こしして字幕オーバーレイへ送信します。")
    parser.add_argument("--list-devices", action="store_true", help="利用可能なオーディオデバイスを表示して終了する")
    args = parser.parse_args()

    if args.list_devices:
        list_devices()
        return

    try:
        run(
            caption_url=os.environ.get("CAPTION_URL", DEFAULT_CAPTION_URL),
            model=os.environ.get("WHISPER_MODEL", DEFAULT_WHISPER_MODEL),
            device=parse_device(os.environ.get("MIC_DEVICE")),
        )
    except KeyboardInterrupt:
        print("\n[caption-stt] 終了しました。")


if __name__ == "__main__":
    main()
