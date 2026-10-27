import pytest

from caption_stt import is_valid_caption, parse_device


@pytest.mark.parametrize(
    "text",
    ["こんにちは", "ナイス！", "チャンネル登録よろしくお願いします、今日はバイトします"],
)
def test_accepts_normal_speech(text):
    assert is_valid_caption(text)


@pytest.mark.parametrize(
    "text",
    ["", "   ", "。", "…", "ご視聴ありがとうございました", "ご視聴ありがとうございました。", " ご清聴ありがとうございました！ "],
)
def test_rejects_empty_and_hallucinations(text):
    assert not is_valid_caption(text)


@pytest.mark.parametrize(
    ("value", "expected"),
    [(None, None), ("", None), ("6", 6), ("MIC (BRIDGE", "MIC (BRIDGE")],
)
def test_parse_device(value, expected):
    assert parse_device(value) == expected
