import numpy as np
import pytest

from caption_stt import (
    GLOSSARY,
    TELOP_COOLDOWN_SECONDS,
    TELOP_REFRESH_SECONDS,
    TelopMatcher,
    build_prompt,
    caption_rejection,
    default_effect_url,
    default_telop_url,
    is_valid_caption,
    load_sample,
    match_effect,
    match_telop,
    parse_device,
    save_sample,
    select_segments,
)


@pytest.mark.parametrize(
    "text",
    [
        "こんにちは",
        "ナイス！",
        "チャンネル登録よろしくお願いします、今日はバイトします",
        "SSしたばっかりでこれから確認する",
        "WAVE3きた",
        "うわぁー! 危ない!",
    ],
)
def test_accepts_normal_speech(text):
    assert is_valid_caption(text)


@pytest.mark.parametrize(
    "text",
    ["", "   ", "。", "…", "ご視聴ありがとうございました", "ご視聴ありがとうございました。", " ご清聴ありがとうございました！ "],
)
def test_rejects_empty_and_hallucinations(text):
    assert not is_valid_caption(text)


@pytest.mark.parametrize("text", ["あ", "ん", "よ", "え〜", "はい", "わっ", "えっ?", "ハイ"])
def test_rejects_fillers(text):
    assert caption_rejection(text) == "相づち"


@pytest.mark.parametrize("text", ["якобы", "안녕"])
def test_rejects_non_japanese_letters(text):
    assert caption_rejection(text) == "日本語以外の文字"


@pytest.mark.parametrize("text", ["citizens", "んー moments", "このフレ Steinらけを重ねます", "マスコレイを塗ってアジオ hide"])
def test_rejects_english_words(text):
    assert caption_rejection(text) == "英単語"


def test_select_segments_drops_low_confidence():
    text, rejected = select_segments(
        [
            {"text": "サーモンラン", "avg_logprob": -0.3, "no_speech_prob": 0.1, "compression_ratio": 1.0},
            {"text": "やっていきます", "avg_logprob": -0.5, "no_speech_prob": 0.1, "compression_ratio": 1.0},
            {"text": "citizens", "avg_logprob": -1.2, "no_speech_prob": 0.1, "compression_ratio": 1.0},
            {"text": "ん", "avg_logprob": -0.3, "no_speech_prob": 0.9, "compression_ratio": 1.0},
            {"text": "ああああ", "avg_logprob": -0.3, "no_speech_prob": 0.1, "compression_ratio": 5.0},
            {"text": "  ", "avg_logprob": -0.3, "no_speech_prob": 0.1, "compression_ratio": 1.0},
        ]
    )
    assert text == "サーモンランやっていきます"
    assert [t for _, t in rejected] == ["citizens", "ん", "ああああ"]
    assert rejected[0][0] == "信頼度 -1.20"


def test_build_prompt_puts_glossary_last():
    assert build_prompt(["ナイス!", "満潮きた"]) == "ナイス!。満潮きた。" + GLOSSARY
    assert build_prompt([]) == GLOSSARY


PRESETS = [
    {"id": 1, "text": "ナイス!"},
    {"id": 2, "text": "カタパッド残った…"},
    {"id": 3, "text": "満潮きた"},
    {"id": 4, "text": "OK"},
]


@pytest.mark.parametrize(
    ("text", "expected_id"),
    [
        ("ナイス", 1),
        ("ないす！", 1),
        ("ナイス！ナイス！", 1),
        ("カタパッド残った", 2),
        ("カタパット残った", 2),  # 少しの聞き間違いは類似度で拾う
        ("満潮来た", None),  # 漢字の違いは似ていても短いと届かない
        ("満潮きたー！", 3),
        ("OK", 4),
        ("ok", 4),
    ],
)
def test_match_telop(text, expected_id):
    preset = match_telop(text, PRESETS)
    assert (preset["id"] if preset else None) == expected_id


@pytest.mark.parametrize(
    "text",
    [
        "ナイスって言ってる場合じゃないんだよな",  # 長い発話の一部に含まれるだけ
        "OKじゃない",  # 2文字以下のテロップは完全一致のみ
        "こんにちは",
        "",
    ],
)
def test_match_telop_ignores_unrelated_speech(text):
    assert match_telop(text, PRESETS) is None


class FakeClock:
    def __init__(self):
        self.now = 0.0

    def __call__(self):
        return self.now


def make_matcher(fetch=None, show=None):
    clock = FakeClock()
    shown: list[int] = []
    fetches: list[str] = []

    def default_fetch(url):
        fetches.append(url)
        return PRESETS

    def default_show(_url, preset_id):
        shown.append(preset_id)

    matcher = TelopMatcher("http://localhost:3000/api/telop", fetch or default_fetch, show or default_show, clock)
    return matcher, clock, shown, fetches


def test_telop_matcher_shows_matched_preset_once_per_cooldown():
    matcher, clock, shown, _ = make_matcher()
    matcher.refresh()

    assert matcher.try_show("ナイス")["id"] == 1
    clock.now = TELOP_COOLDOWN_SECONDS - 1
    assert matcher.try_show("ナイス")["id"] == 1  # 字幕には送らないが出し直さない
    clock.now = TELOP_COOLDOWN_SECONDS + 1
    assert matcher.try_show("ナイス")["id"] == 1
    assert matcher.try_show("こんにちは") is None
    assert shown == [1, 1]


def test_telop_matcher_refreshes_presets_periodically():
    matcher, clock, _, fetches = make_matcher()
    matcher.refresh()
    matcher.refresh()
    clock.now = TELOP_REFRESH_SECONDS
    matcher.refresh()
    assert len(fetches) == 2


def test_telop_matcher_keeps_previous_presets_when_fetch_fails():
    calls = []

    def flaky_fetch(_url):
        calls.append(1)
        if len(calls) > 1:
            raise RuntimeError("down")
        return PRESETS

    matcher, clock, _, _ = make_matcher(fetch=flaky_fetch)
    matcher.refresh()
    clock.now = TELOP_REFRESH_SECONDS
    matcher.refresh()
    assert matcher.presets == PRESETS


def test_telop_matcher_without_presets_matches_nothing():
    def failing_fetch(_url):
        raise RuntimeError("down")

    matcher, _, shown, _ = make_matcher(fetch=failing_fetch)
    matcher.refresh()
    assert matcher.try_show("ナイス") is None
    assert shown == []


def test_telop_matcher_falls_back_to_caption_when_show_fails():
    def failing_show(_url, _preset_id):
        raise RuntimeError("down")

    matcher, _, _, _ = make_matcher(show=failing_show)
    matcher.refresh()
    assert matcher.try_show("ナイス") is None


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("ナイス！", "STAR"),
        ("ないすー", "STAR"),
        ("ありがとうございます", "LOVE"),
        ("よっしゃー！", "SPARKLE"),
        ("やべぇ", "BUBBLE"),
        ("ヤバい", "BUBBLE"),
        ("ナイスありがとう", "STAR"),  # 複数含むときは上のものを優先
        ("こんにちは", None),
    ],
)
def test_match_effect(text, expected):
    assert match_effect(text) == expected


def test_default_effect_url():
    assert default_effect_url("http://localhost:3000/api/caption") == "http://localhost:3000/api/stream-data"


def test_default_telop_url():
    assert default_telop_url("http://localhost:3000/api/caption") == "http://localhost:3000/api/telop"


def test_save_and_load_sample(tmp_path):
    audio = np.array([0.0, 0.5, -0.5, 1.0], dtype=np.float32)
    save_sample(tmp_path, audio, "サーモンラン")

    [wav] = tmp_path.glob("*.wav")
    assert np.allclose(load_sample(wav), audio, atol=1e-4)
    assert wav.with_suffix(".txt").read_text(encoding="utf-8") == "サーモンラン\n"


@pytest.mark.parametrize(
    ("value", "expected"),
    [(None, None), ("", None), ("6", 6), ("MIC (BRIDGE", "MIC (BRIDGE")],
)
def test_parse_device(value, expected):
    assert parse_device(value) == expected
