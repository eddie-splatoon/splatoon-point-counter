from datetime import datetime
from pathlib import Path

import pytest
from PIL import Image, ImageDraw

import salmon_result as s
from salmon_result import Box

# 実際の詳細画面（407x897）を OCR したときの主な Box（プレイヤー名は伏せている）
DETAIL_BOXES = [
    Box("9:15", 0.143, 0.067, 0.143, 0.021),
    Box("いつものバイト", 0.394, 0.127, 0.213, 0.019),
    Box("2026/11/9 21:18", 0.035, 0.166, 0.25, 0.015),
    Box("アラマキ砦", 0.869, 0.17, 0.09, 0.013),
    Box("Clear！", 0.384, 0.19, 0.245, 0.029),
    Box("WAVE 1", 0.212, 0.4, 0.096, 0.015),
    Box("WAVE 2", 0.449, 0.4, 0.1, 0.015),
    Box("WAVE 3", 0.689, 0.4, 0.103, 0.015),
    Box("プレイヤー1", 0.064, 0.591, 0.193, 0.02),
    Box("オオモノジャケ ×24", 0.064, 0.615, 0.176, 0.013),
    Box("プレイヤー2", 0.064, 0.65, 0.173, 0.022),
    Box("オオモノジャケ×17", 0.064, 0.673, 0.176, 0.015),
    Box("最新のパイトへ", 0.054, 0.868, 0.202, 0.015),
    Box("ホーム", 0.135, 0.936, 0.08, 0.013),
    Box("サーモンラン", 0.744, 0.936, 0.163, 0.013),
]

HISTORY_BOXES = [
    Box("バイトヒストリー", 0.35, 0.39, 0.3, 0.02),
    Box("11/8 09:00 - 11/10 01:00", 0.33, 0.44, 0.34, 0.015),
    Box("163", 0.9, 0.53, 0.05, 0.015),
    Box("Clear!!", 0.08, 0.565, 0.12, 0.015),
    Box("x126", 0.88, 0.555, 0.07, 0.013),
    Box("x3403", 0.86, 0.578, 0.09, 0.013),
    Box("x114", 0.88, 0.608, 0.07, 0.013),
    Box("ホーム", 0.135, 0.936, 0.08, 0.013),
]


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("x12<8>", 12), ("X60", 60), ("x25cl>", 25), ("×710", 710), ("オオモノシャケx24", 24), ("オオモノジャケ ×17", 17),
        ("Xl", 1), ("XI", 1), ("x", None), ("普通", None),
    ],
)
def test_parse_count(text, expected):
    assert s.parse_count(text) == expected


def test_parse_played_at_pads_the_date():
    assert s.parse_played_at(DETAIL_BOXES) == "2026/11/09 21:18"
    assert s.parse_played_at([Box("2026/12/31 ２３:０５", 0, 0, 0, 0)]) == "2026/12/31 23:05"
    assert s.parse_played_at([Box("9:15", 0, 0, 0, 0)]) is None


@pytest.mark.parametrize(
    ("text", "expected"),
    [("Clear！", True), ("Cear！！", True), ("Ceary！", True), ("Failure", False), ("Failnre", False), ("Failire", False),
     ("クリアボーナス", None), ("Aン", None), ("WAVE 1", None)],
)
def test_classify_outcome(text, expected):
    assert s.classify_outcome(text) is expected


def test_parse_outcome():
    assert s.parse_outcome(DETAIL_BOXES) == (True, 3)
    failed = [Box("Failure", 0, 0, 0, 0), Box("クリアボーナス", 0, 0, 0, 0)] + [b for b in DETAIL_BOXES if b.text.startswith("WAVE") and b.text != "WAVE 3"]
    assert s.parse_outcome(failed) == (False, 2)
    assert s.parse_outcome([Box("ホーム", 0, 0, 0, 0)]) is None
    # 両方に読めたら決めない
    assert s.parse_outcome([Box("Clear", 0, 0, 0, 0), Box("Failure", 0, 0, 0, 0), Box("WAVE 1", 0, 0, 0, 0)]) is None


def test_stage():
    played_at = DETAIL_BOXES[2]
    assert s.find_stage_box(DETAIL_BOXES, played_at).text == "アラマキ砦"
    assert s.canonical_stage("アラマ午砦") == "アラマキ砦"
    assert s.canonical_stage("ムニ・エール海洋発電新") == "ムニ・エール海洋発電所"
    # ビッグランなど、知らないステージは読めたまま
    assert s.canonical_stage("ユノハナ大渓谷") == "ユノハナ大渓谷"


def test_find_self_row_and_history_row():
    assert s.find_self_row(DETAIL_BOXES).text == "オオモノジャケ ×24"
    assert s.find_first_history_row(HISTORY_BOXES).text == "x126"
    assert s.find_first_history_row(DETAIL_BOXES) is None


def test_capture_name():
    assert s.capture_name(datetime(2026, 11, 10, 21, 5, 3), "detail") == "20261110-210503-detail.png"


FIXTURES = Path(__file__).parent / "fixtures"


# ブキの参照画像（pnpm salmon-result の初回にダウンロードされる）。無ければブキの照合はテストしない
REFS_DIR = s.DEFAULT_REFS_DIR


@pytest.mark.parametrize(
    ("fixture", "played_at", "expected", "weapon_icons", "weapons"),
    [
        ("clear.png", "2026/11/09 21:18", {"goldenEggs": 12, "bossKills": 24, "deaths": 2, "cleared": True, "waveReached": 3}, 3,
         ["gaen_ff", "furo", "tristringer"]),
        ("failure.png", "2026/11/08 23:43", {"goldenEggs": 10, "bossKills": 21, "deaths": 4, "cleared": False, "waveReached": 2}, 2,
         ["nova", "furo"]),
        # オカシラ（EX-WAVE）で負けても、WAVE 3 までクリアしていればクリア。ブキは EX-WAVE の分も入れて 4 つ
        ("kingpin.png", "2026/11/08 23:26", {"goldenEggs": 30, "bossKills": 26, "deaths": 2, "cleared": True, "waveReached": 3}, 4,
         ["gaen_ff", "furo", "tristringer", "nova"]),
    ],
)
def test_read_job_from_captures(fixture, played_at, expected, weapon_icons, weapons):
    """実際の詳細画面（プレイヤー名は塗りつぶしている）を Vision で読む"""
    with Image.open(FIXTURES / fixture) as image:
        image = image.convert("RGB")
        job, read_played_at = s.read_job(image, {})
        row = s.find_self_row(s.ocr(image, s.FULL_OCR_SCALE))
        assert len(s.weapon_icons(image, row, s.SelfRowCells())) == weapon_icons
        if REFS_DIR.exists():
            assert s.read_job(image, s.ensure_weapon_refs(REFS_DIR))[0]["weapons"] == weapons
    assert read_played_at == played_at
    assert job == {**expected, "stage": "アラマキ砦", "weapons": []}


class FakeOcr:
    """全体の OCR は boxes を返し、切り出した部分は何も読めない"""

    def __init__(self, boxes):
        self.boxes = boxes

    def __call__(self, image, scale=1):
        return self.boxes if scale == s.FULL_OCR_SCALE else []


def blank_detail_image():
    return Image.new("RGB", (407, 897), (200, 60, 40))


def test_read_job_fails_instead_of_guessing():
    with pytest.raises(s.ImportError_, match="金イクラ"):
        s.read_job(blank_detail_image(), {}, ocr_fn=FakeOcr(DETAIL_BOXES))
    without_outcome = [b for b in DETAIL_BOXES if "Clear" not in b.text]
    with pytest.raises(s.ImportError_, match="クリア / 失敗"):
        s.read_job(blank_detail_image(), {}, ocr_fn=FakeOcr(without_outcome))
    without_date = [b for b in DETAIL_BOXES if "2026" not in b.text]
    with pytest.raises(s.ImportError_, match="日時"):
        s.read_job(blank_detail_image(), {}, ocr_fn=FakeOcr(without_date))
    without_self_row = [b for b in DETAIL_BOXES if "オオモノ" not in b.text]
    with pytest.raises(s.ImportError_, match="自分の行"):
        s.read_job(blank_detail_image(), {}, ocr_fn=FakeOcr(without_self_row))


def test_vote_count_takes_the_majority():
    readings = iter(["x12<8>", "x121", "", "x12"])
    assert s.vote_count(blank_detail_image(), lambda image, scale: [Box(next(readings), 0, 0, 1, 1)]) == 12
    assert s.vote_count(blank_detail_image(), lambda image, scale: []) is None


def icon(color, shape):
    image = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    if shape == "bar":
        draw.rectangle((8, 26, 56, 38), fill=color)
    else:
        draw.ellipse((16, 16, 48, 48), fill=color)
    return image


def test_match_weapon():
    refs = {"a": s.ref_vector(icon((255, 200, 0, 255), "bar")), "b": s.ref_vector(icon((0, 120, 255, 255), "circle"))}
    # イカリング3のアイコンは、行の赤い背景の上の黒い丸に小さく描かれている
    target = Image.new("RGB", (64, 64), (220, 70, 50))
    ImageDraw.Draw(target).ellipse((0, 0, 63, 63), fill=(0, 0, 0))
    target.paste(icon((0, 120, 255, 255), "circle").convert("RGB").resize((60, 60)), (2, 2), icon((0, 120, 255, 255), "circle").resize((60, 60)))
    target = target.resize((18, 18))
    assert s.match_weapon(target, refs) == "b"
    assert s.match_weapon(target, {}) is None
    # 2 番目と差が無ければ決めない
    assert s.match_weapon(target, {"b": refs["b"], "c": refs["b"]}) is None


def test_find_icon_blobs_tells_weapons_from_specials():
    """ブキは丸、スペシャルは四角。上の行から左→右の順"""
    region = Image.new("RGB", (120, 60), (220, 70, 50))
    draw = ImageDraw.Draw(region)
    draw.ellipse((40, 2, 57, 19), fill=(0, 0, 0))
    draw.ellipse((5, 2, 22, 19), fill=(0, 0, 0))
    draw.rectangle((5, 30, 22, 47), fill=(30, 20, 90))
    draw.ellipse((40, 30, 41, 31), fill=(0, 0, 0))  # 小さすぎるものは無視
    region.info["full_width"] = 407
    blobs = s.find_icon_blobs(region)
    assert [(x, y) for x, y, *_ in blobs] == [(5, 2), (40, 2), (5, 30)]
    assert [fill < s.MAX_WEAPON_ICON_FILL for *_, fill in blobs] == [True, True, False]


def test_is_job_detail():
    assert s.is_job_detail(DETAIL_BOXES)
    assert not s.is_job_detail(HISTORY_BOXES)
