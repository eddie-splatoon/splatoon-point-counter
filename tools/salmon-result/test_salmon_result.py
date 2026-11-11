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
        ("Xl", 1), ("XI", 1), ("オオモノジャケ メi7", 17), ("オオモノシャケ xil", None), ("x", None), ("普通", None),
        # x31<2> の「<」を 4 と読んだもの。3142 や 314 にしない
        ("×3142>", None), ("X3142>0）", None), ("X31<2>", 31), ("X31c2>$/", 31), ("×31¢2>：", 31),
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


def test_parse_job_kind():
    assert s.parse_job_kind(DETAIL_BOXES) == "regular"
    assert s.parse_job_kind([Box("ビッグラン", 0.4, 0.127, 0.2, 0.019)]) == "bigRun"
    assert s.parse_job_kind([Box("バイトチームコンテスト", 0.3, 0.127, 0.4, 0.019)]) == "teamContest"
    # タイトルが読めなくても、WAVE 4・5 があればバイトチームコンテスト
    assert s.parse_job_kind([Box("WAVE 4", 0.33, 0.58, 0.1, 0.015)]) == "teamContest"
    assert s.parse_job_kind([Box("WAVE 1", 0.2, 0.4, 0.1, 0.015)]) is None


def test_parse_outcome_of_a_team_contest():
    assert s.parse_outcome([Box("Clear!!", 0, 0, 0, 0)], s.max_wave_for("teamContest")) == (True, 5)
    failed = [Box("Failure", 0, 0, 0, 0)] + [Box(f"WAVE {n}", 0, 0, 0, 0) for n in (1, 2, 3, 4)]
    assert s.parse_outcome(failed, s.max_wave_for("teamContest")) == (False, 4)
    # 通常のバイトでは WAVE 4 は無い
    assert s.parse_outcome(failed) == (False, 3)


def test_parse_outcome():
    assert s.parse_outcome(DETAIL_BOXES) == (True, 3)
    failed = [Box("Failure", 0, 0, 0, 0), Box("クリアボーナス", 0, 0, 0, 0)] + [b for b in DETAIL_BOXES if b.text.startswith("WAVE") and b.text != "WAVE 3"]
    assert s.parse_outcome(failed) == (False, 2)
    assert s.parse_outcome([Box("ホーム", 0, 0, 0, 0)]) is None
    # 両方に同じ数だけ読めたら決めない
    assert s.parse_outcome([Box("Clear", 0, 0, 0, 0), Box("Failure", 0, 0, 0, 0), Box("WAVE 1", 0, 0, 0, 0)]) is None
    # 明るいステージでは倍率によって Failure に似た文字に読むことがあるので、多数決にする
    assert s.parse_outcome([Box("Cear！！", 0, 0, 0, 0), Box("Cear！", 0, 0, 0, 0), Box("FiLcaP", 0, 0, 0, 0)]) == (True, 3)


def test_stage():
    played_at = DETAIL_BOXES[2]
    assert s.find_stage_box(DETAIL_BOXES, played_at).text == "アラマキ砦"
    assert s.canonical_stage("アラマ午砦") == "アラマキ砦"
    assert s.canonical_stage("ムニ・エール海洋発電新") == "ムニ・エール海洋発電所"
    # ビッグランなど、知らないステージは読めたまま
    assert s.canonical_stage("ユノハナ大渓谷") == "ユノハナ大渓谷"
    # 小さい文字の濁点・半濁点の読み違いは区別しない
    assert s.canonical_stage("どんびご関検場") == "どんぴこ闘技場"
    assert s.canonical_stage("タラボートショッビングパーク") == "タラポートショッピングパーク"
    assert s.vote_stage(["雷料目こ243", "どんびこ関検場", "どんぶこ関検場"]) == "どんぴこ闘技場"
    assert s.vote_stage(["ユノハナ大渓谷"]) == "ユノハナ大渓谷"


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
    assert job == {**expected, "stage": "アラマキ砦", "weapons": [], "jobKind": "regular"}


# ビッグラン・バイトチームコンテストの詳細画面（iPhone のスクリーンショットをミラーリングの撮影と同じ大きさ・配置にしたもの。
# プレイヤー名は塗りつぶしている）。小さく縮めたので、ブキ・スペシャルの照合は確かめない
@pytest.mark.parametrize(
    ("fixture", "played_at", "expected", "weapon_icons"),
    [
        # バイトチームコンテストは WAVE 5 まで。ブキは固定で、WAVE ごとに同じブキが 5 つ並ぶ
        ("teamcontest-clear.png", "2026/02/14 16:36",
         {"goldenEggs": 80, "bossKills": 21, "deaths": 2, "cleared": True, "waveReached": 5, "stage": "どんぴこ闘技場", "jobKind": "teamContest"}, 5),
        ("teamcontest-clear-2.png", "2026/08/30 20:41",
         {"goldenEggs": 63, "bossKills": 16, "deaths": 0, "cleared": True, "waveReached": 5, "stage": "ムニ・エール海洋発電所", "jobKind": "teamContest"}, 5),
        # ビッグランはバトルのステージ。明るいステージの上の「Clear!!」は、黄緑の文字だけを取り出して読む
        ("bigrun-kingpin.png", "2026/06/21 15:47",
         {"goldenEggs": 59, "bossKills": 20, "deaths": 3, "cleared": True, "waveReached": 3, "stage": "タラポートショッピングパーク", "jobKind": "bigRun"}, 4),
        ("bigrun-kingpin-ng.png", "2026/06/20 23:19",
         {"goldenEggs": 35, "bossKills": 29, "deaths": 3, "cleared": True, "waveReached": 3, "stage": "ゴンズイ地区", "jobKind": "bigRun"}, 4),
    ],
)
def test_read_job_from_big_run_and_team_contest(fixture, played_at, expected, weapon_icons):
    with Image.open(FIXTURES / fixture) as image:
        image = image.convert("RGB")
        boxes = s.ocr(image, s.FULL_OCR_SCALE)
        job, read_played_at = s.read_job(image, {}, boxes=boxes)
        assert len(s.weapon_icons(image, s.find_self_row(boxes), s.SelfRowCells())) == weapon_icons
    assert read_played_at == played_at
    assert job == {**expected, "weapons": []}


TEAM_CONTEST_WAVES = {
    "teamcontest-clear.png": [(1, 21, 10), (2, 55, 18), (3, 82, 26), (4, 69, 30), (5, 57, 32)],
    "teamcontest-clear-2.png": [(1, 21, 10), (2, 62, 18), (3, 50, 26), (4, 46, 29), (5, 54, 30)],
}


@pytest.mark.parametrize(("fixture", "team_eggs"), [("teamcontest-clear.png", (284, 6942)), ("teamcontest-clear-2.png", (233, 7197))])
def test_read_team_contest_details(fixture, team_eggs):
    """評価の行が無いので、チームのイクラは上に詰まって出る。WAVE 4・5 は 2 段目"""
    with Image.open(FIXTURES / fixture) as image:
        image = image.convert("RGB")
        details = s.read_details(image, s.ocr(image, s.FULL_OCR_SCALE), {}, {})
    assert (details["teamGoldenEggs"], details["teamPowerEggs"]) == team_eggs
    assert (details["gradeName"], details["gradePoint"], details["kingName"]) == (None, None, None)
    assert [(w["wave"], w["delivered"], w["quota"]) for w in details["waves"]] == TEAM_CONTEST_WAVES[fixture]
    # 1 段目の WAVE のスペシャルの段に、2 段目の GJ! を数えない
    assert [w["specialsUsed"] for w in details["waves"][:2]] == [0, 0 if fixture == "teamcontest-clear.png" else 2]


@pytest.mark.parametrize(
    ("fixture", "header"),
    [
        ("bigrun-kingpin.png", {"gradeName": "でんせつ", "gradePoint": 999, "teamGoldenEggs": 234, "kingName": "オカシラ連合", "kingDefeated": True}),
        ("bigrun-kingpin-ng.png", {"gradeName": "でんせつ", "gradePoint": 590, "teamGoldenEggs": 162, "kingName": "オカシラ連合", "kingDefeated": False}),
    ],
)
def test_read_big_run_details(fixture, header):
    with Image.open(FIXTURES / fixture) as image:
        image = image.convert("RGB")
        details = s.read_details(image, s.ocr(image, s.FULL_OCR_SCALE), {}, {})
    assert {k: details[k] for k in header} == header
    assert [w["wave"] for w in details["waves"]] == [1, 2, 3, s.EX_WAVE]


HEADERS = {
    "clear.png": {
        "hazardLevel": 333, "gradeName": "でんせつ", "gradePoint": 999, "jobPoint": 472, "jobScore": 130, "jobRate": 3.25, "clearBonus": 50,
        "teamGoldenEggs": 114, "teamPowerEggs": 3281, "scaleBronze": None, "scaleSilver": None, "scaleGold": None,
        "kingName": None, "kingDefeated": None,
    },
    "failure.png": {
        "hazardLevel": 322, "gradeName": "でんせつ", "gradePoint": 790, "jobPoint": 228, "jobScore": 75, "jobRate": 3.05, "clearBonus": 0,
        "teamGoldenEggs": 62, "teamPowerEggs": 2721, "scaleBronze": None, "scaleSilver": None, "scaleGold": None,
        "kingName": None, "kingDefeated": None,
    },
    # オカシラ（ヨコヅナ）に負けた（EX-WAVE が NG）。ウロコは 銅 4・銀 4・金 0
    "kingpin.png": {
        "hazardLevel": 305, "gradeName": "でんせつ", "gradePoint": 780, "jobPoint": 533, "jobScore": 142, "jobRate": 3.05, "clearBonus": 100,
        "teamGoldenEggs": 114, "teamPowerEggs": 5751, "scaleBronze": 4, "scaleSilver": 4, "scaleGold": 0,
        "kingName": "ヨコヅナ", "kingDefeated": False,
    },
}


def wave(n, delivered, quota, water, golden, specials, event=""):
    return {"wave": n, "delivered": delivered, "quota": quota, "waterLevel": water, "event": event, "goldenAppearances": golden, "specialsUsed": specials}


WAVES = {
    "clear.png": [wave(1, 36, 30, "普通", 78, 3), wave(2, 42, 32, "普通", 90, 1), wave(3, 36, 35, "普通", 81, 2)],
    "failure.png": [wave(1, 42, 29, "満潮", 84, 0), wave(2, 20, 31, "満潮", 63, 8)],
    "kingpin.png": [
        wave(1, 38, 29, "普通", 63, 1, "霧"), wave(2, 31, 31, "満潮", 72, 1), wave(3, 45, 33, "普通", 81, 6),
        wave(6, None, None, "普通", 66, 3),
    ],
}

# (オオモノ, 金イクラ, アシスト, 赤イクラ, 救助, 被救助)。アシストが 0 のときは <0> が表示されない
PLAYERS = {
    "clear.png": [(24, 12, 8, 684, 1, 2), (24, 60, 0, 1254, 3, 0), (17, 25, 1, 633, 2, 1), (18, 17, 4, 710, 0, 3)],
    "failure.png": [(21, 10, 0, 912, 4, 4), (14, 7, 0, 594, 3, 2), (4, 28, 0, 492, 2, 4), (10, 17, 0, 723, 2, 1)],
    "kingpin.png": [(26, 30, 6, 1262, 1, 2), (23, 17, 8, 2107, 3, 3), (19, 47, 2, 886, 2, 0), (20, 20, 7, 1496, 1, 2)],
}

SPECIALS = {
    "clear.png": ["sameride", "kanitank", "nicedama", "jetpack"],
    "failure.png": ["sameride", "kanitank", "tripletornado", "megaphone51"],
    "kingpin.png": ["megaphone51", "sameride", "nicedama", "tripletornado"],
}


@pytest.mark.parametrize("fixture", ["clear.png", "failure.png", "kingpin.png"])
def test_read_details_from_captures(fixture):
    """詳細画面の上部・WAVE・プレイヤー（名前は塗りつぶしているので読まない）"""
    with Image.open(FIXTURES / fixture) as image:
        image = image.convert("RGB")
        boxes = s.ocr(image, s.FULL_OCR_SCALE)
        details = s.read_details(image, boxes, {}, {})
        if REFS_DIR.exists():
            with_refs = s.read_details(image, boxes, s.ensure_weapon_refs(REFS_DIR), s.ensure_special_refs(REFS_DIR))
            assert [p["special"] for p in with_refs["players"]] == SPECIALS[fixture]
            assert all(len(p["weapons"]) == len(with_refs["players"][0]["weapons"]) for p in with_refs["players"])
    assert {k: v for k, v in details.items() if k not in ("waves", "players")} == HEADERS[fixture]
    assert details["waves"] == WAVES[fixture]
    keys = ("bossKills", "goldenEggs", "goldenAssists", "powerEggs", "rescues", "rescued")
    assert [tuple(p[k] for k in keys) for p in details["players"]] == PLAYERS[fixture]
    assert [p["position"] for p in details["players"]] == [0, 1, 2, 3]


@pytest.mark.parametrize(
    ("text", "expected"),
    [("x12<8>", 8), ("x25c1>", 1), ("x17<4>", 4), ("x60", None), ("x1Tぐ4>", None), ("<8>", None)],
)
def test_parse_assist(text, expected):
    assert s.parse_assist(text) == expected


def test_parse_header_texts():
    assert s.parse_hazard_level("キケン度333%") == 333
    assert s.parse_hazard_level("キケン度305％") == 305
    assert s.parse_hazard_level("キケン度") is None
    assert s.parse_grade("さんせつ999") == ("でんせつ", 999)
    assert s.parse_grade("たつじん+2 40") == ("たつじん+2", 40)
    assert s.parse_grade("たつじん+240") == ("たつじん+2", 40)
    assert s.parse_grade("じゅくれん 5") == ("じゅくれん", 5)
    assert s.parse_score_line("130 x 3.25+") == (130, 3.25)
    assert s.parse_quota("36/30") == (36, 30)
    assert s.parse_points("472p") == 472
    assert s.closest("普渔", s.WATER_LEVELS) == "普通"
    assert s.closest("满潮", s.WATER_LEVELS) == "満潮"
    assert s.closest("ヨコッナ", s.KNOWN_KINGS) == "ヨコヅナ"


def test_describe_details_does_not_include_names():
    details = {"hazardLevel": 333, "waves": [{"wave": 1, "delivered": 36, "quota": 30}], "players": [{"name": "みかた"}]}
    assert "みかた" not in s.describe_details(details)


def test_read_result_keeps_the_job_when_details_fail(monkeypatch):
    monkeypatch.setattr(s, "ocr", lambda image, scale=1: [])
    monkeypatch.setattr(s, "read_job", lambda image, refs, boxes=None: ({"goldenEggs": 1}, "2026/11/09 21:18"))

    def broken(*args, **kwargs):
        raise ValueError("想定外の画面")

    monkeypatch.setattr(s, "read_details", broken)
    logs = []
    assert s.read_result(blank_detail_image(), {}, {}, logs.append) == ({"goldenEggs": 1}, "2026/11/09 21:18", None)
    assert "詳細を読み取れませんでした" in logs[0]


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
    readings = iter(["x12<8>", "x121", "", "", "x12"])
    assert s.vote_count(blank_detail_image(), lambda image, scale: [Box(next(readings), 0, 0, 1, 1)]) == 12
    assert s.vote_count(blank_detail_image(), lambda image, scale: []) is None


def test_vote_count_ignores_assist_misread_as_digit():
    # 実際の配信で x31<2> を 3142 と記録した読み方の並び（<2> の「<」を 4 と読んだ）
    readings = iter(["×3142>", "×3142>", "X31c2>$/", "X31<2>", ""])
    assert s.vote_count(blank_detail_image(), lambda image, scale: [Box(next(readings), 0, 0, 1, 1)]) == 31


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


def test_should_stop_backfill():
    session_started_at = datetime(2026, 11, 10, 20, 0).timestamp() * 1000
    recorded = {"2026/11/10 20:30"}
    assert not s.should_stop_backfill("2026/11/10 20:45", recorded, session_started_at)
    # 記録済みのバイトまで来たらやめる
    assert s.should_stop_backfill("2026/11/10 20:30", recorded, session_started_at)
    # 今のセッションより前（前の配信）のバイトは記録しない
    assert s.should_stop_backfill("2026/11/10 19:55", recorded, session_started_at)
    # セッションが無ければ遡らない
    assert s.should_stop_backfill("2026/11/10 20:45", recorded, None)


@pytest.mark.parametrize(("text_color", "expected"), [((255, 255, 255), False), ((117, 117, 117), True)])
def test_is_latest_job(text_color, expected):
    """最新のバイトでは「次のバイト」が押せず、文字が灰色になる"""
    image = Image.new("RGB", (407, 897), (60, 60, 60))
    left, top, right, bottom = s.NEXT_JOB_BUTTON_REGION
    ImageDraw.Draw(image).rectangle((left * 407 + 10, top * 897 + 2, left * 407 + 30, bottom * 897 - 2), fill=text_color)
    assert s.is_latest_job(image, DETAIL_BOXES) is expected


# オオモノの欄（詳細画面をスクロールした先。上のプレイヤーの一覧は塗りつぶしている）。
# (key, 出現数, チームの討伐数, 自分の討伐数) の SALMON_BOSSES の順と、自分の討伐数の合計（「オオモノシャケ xN」）
BOSSES = {
    "failure": (26, [("bakudan", 8, 7, 3), ("katapad", 7, 7, 1), ("teppan", 4, 4, 2), ("hebi", 4, 3, 2), ("tower", 12, 11, 8),
                     ("mogura", 9, 9, 2), ("koumori", 12, 9, 3), ("hashira", 7, 5, 0), ("diver", 8, 7, 2), ("nabebuta", 7, 5, 3)]),
    "clear": (25, [("bakudan", 4, 4, 3), ("katapad", 10, 8, 5), ("teppan", 8, 8, 3), ("hebi", 5, 4, 1), ("tower", 7, 7, 2),
                   ("mogura", 6, 6, 1), ("koumori", 10, 5, 2), ("hashira", 11, 11, 5), ("diver", 7, 6, 2), ("tekkyu", 4, 4, 1),
                   ("nabebuta", 6, 5, 0)]),
    # オカシラが出たバイトは一覧が 1 画面に収まらない（2 枚目ではバクダン・カタパッドが上に隠れる）
    "kingpin": (33, [("bakudan", 10, 10, 2), ("katapad", 8, 8, 3), ("teppan", 13, 13, 4), ("hebi", 5, 5, 2), ("tower", 8, 8, 4),
                     ("mogura", 10, 10, 4), ("koumori", 6, 6, 4), ("hashira", 6, 6, 2), ("diver", 12, 11, 3), ("tekkyu", 7, 6, 4),
                     ("nabebuta", 5, 5, 1)]),
    # カッコ内の小さい「5」の左下がつながって 6 に近い（グリルの 13(5)）
    "five": (25, [("bakudan", 8, 8, 3), ("katapad", 13, 12, 1), ("teppan", 5, 4, 1), ("hebi", 7, 7, 1), ("tower", 9, 9, 3),
                  ("mogura", 9, 9, 3), ("koumori", 7, 6, 1), ("hashira", 10, 10, 1), ("diver", 8, 8, 2), ("nabebuta", 7, 7, 4),
                  ("grill", 14, 13, 5)]),
    # 大きい「8」の左が欠けて 9 に近い（ダイバーの 8(3) / 出現数x8）
    "eight": (27, [("bakudan", 12, 12, 1), ("katapad", 8, 7, 2), ("teppan", 5, 5, 1), ("hebi", 6, 6, 1), ("tower", 4, 4, 3),
                   ("mogura", 13, 13, 8), ("koumori", 7, 7, 2), ("hashira", 8, 7, 3), ("diver", 8, 8, 3), ("nabebuta", 7, 5, 3),
                   ("kin_shake", 4, 4, 0)]),
    # 1 枚目と 2 枚目でタワーの 11(5) の写り方が違う
    "split": (28, [("bakudan", 14, 11, 4), ("katapad", 3, 3, 1), ("teppan", 6, 6, 2), ("hebi", 11, 11, 3), ("tower", 11, 11, 5),
                   ("mogura", 8, 7, 4), ("koumori", 9, 5, 3), ("hashira", 9, 7, 1), ("diver", 8, 8, 1), ("nabebuta", 11, 11, 4)]),
}


@pytest.mark.parametrize("label", list(BOSSES))
def test_read_bosses_from_captures(label):
    self_kills, expected = BOSSES[label]
    readings, ends = [], []
    for step in (1, 2):
        with Image.open(FIXTURES / f"bosses-{label}-{step}.png") as image:
            image = image.convert("RGB")
            boxes = s.ocr(image, s.FULL_OCR_SCALE)
            readings.append(s.read_boss_rows(image, boxes, s.load_boss_names()))
            ends.append(s.is_boss_list_end(boxes))
    assert ends == [False, True]
    bosses = s.merge_boss_rows(readings, self_kills)
    assert sorted((b["boss"], b["appearances"], b["teamKills"], b["selfKills"]) for b in bosses) == sorted(expected)


def test_load_boss_names():
    names = s.load_boss_names()
    assert names["バクダン"] == "bakudan"
    assert names["ドロシャケ"] == "doro_shake"


def test_merge_boss_rows():
    first = {"bakudan": (8, 7, 3), "hebi": (4, 3, 2)}
    second = {"hebi": (4, 3, 2), "tower": (12, 11, 8)}
    misread = {"hebi": (4, 3, 1)}
    assert s.merge_boss_rows([first, second, misread], 13) == [
        {"boss": "bakudan", "appearances": 8, "teamKills": 7, "selfKills": 3},
        {"boss": "hebi", "appearances": 4, "teamKills": 3, "selfKills": 2},
        {"boss": "tower", "appearances": 12, "teamKills": 11, "selfKills": 8},
    ]
    # 自分の討伐数の合計が「オオモノシャケ xN」と合わなければ、読み間違い・取りこぼしとみなす
    assert s.merge_boss_rows([first, second], 14) is None


def test_merge_boss_rows_settles_a_split_vote_by_the_total():
    """同じオオモノの読みが画面ごとに割れて同数なら、合計が「オオモノシャケ xN」と合うほうを採る"""
    first = {"bakudan": (8, 7, 3), "tower": (11, 11, 6)}
    second = {"tower": (11, 11, 5), "hebi": (4, 3, 2)}
    assert s.merge_boss_rows([first, second], 10) == [
        {"boss": "bakudan", "appearances": 8, "teamKills": 7, "selfKills": 3},
        {"boss": "tower", "appearances": 11, "teamKills": 11, "selfKills": 5},
        {"boss": "hebi", "appearances": 4, "teamKills": 3, "selfKills": 2},
    ]
    # 先に読めたほうで合うなら、そちらを採る（今までどおり）
    assert s.merge_boss_rows([first, second], 11)[1]["selfKills"] == 6
    # どちらでも合わなければ読み間違い・取りこぼし
    assert s.merge_boss_rows([first, second], 12) is None


def test_merge_boss_rows_gives_up_when_the_total_fits_more_than_one_way():
    """合計が合う選び方が 2 通り以上あれば、どれが正しいか決められないので None"""
    first = {"bakudan": (8, 7, 3), "tower": (11, 11, 6)}
    second = {"bakudan": (8, 7, 4), "tower": (11, 11, 7)}
    # 3 + 7 と 4 + 6 のどちらも 10
    assert s.merge_boss_rows([first, second], 10) is None
    # 1 通り（4 + 7）なら採る
    assert [b["selfKills"] for b in s.merge_boss_rows([first, second], 11)] == [4, 7]


def glyph(text: str):
    return s._parse_glyph(text)


def test_read_kills_tells_the_closing_paren_from_one():
    from digit_glyphs import GLYPHS

    four, open_paren, two, close_paren, one = (glyph(GLYPHS[c][0]) for c in ("4", "(", "2", ")", "1"))
    assert s.read_kills([four, open_paren, two, close_paren])[0] == (4, 2)
    assert s.read_kills([one, one])[0] == (11, 0)
    assert s.read_kills([]) == []


def test_parse_boss_counts_skips_a_reading_beyond_the_appearances(monkeypatch):
    """いちばん形の合う読みが出現数を超えたら（8 を 9 と読んだなど）、出現数と矛盾しない次の読みを採る"""
    monkeypatch.setattr(s, "glyph_groups", lambda cell: cell)
    monkeypatch.setattr(s, "is_slash", lambda g: g == "/")
    monkeypatch.setattr(s, "read_kills", lambda glyphs: [(9, 3), (8, 3)])
    monkeypatch.setattr(s, "read_number", lambda glyphs: 8)
    big = s._parse_glyph("#/#")
    assert s.parse_boss_counts(["9", "/"], [big]) == (8, 8, 3)
    monkeypatch.setattr(s, "read_kills", lambda glyphs: [(9, 3)])
    assert s.parse_boss_counts(["9", "/"], [big]) is None


def test_is_slash():
    slash = glyph("....##/....##/...##./...##./..##../..##../.##.../.##.../##..../##....")
    seven = glyph("######/######/....##/....##/...##./...##./..##../..##../.##.../.##...")
    assert s.is_slash(slash)
    assert not s.is_slash(seven)


class FakeWindow:
    def __init__(self):
        self.scrolls = []


END_OF_LIST = Box("※カッコ内の数字は自分で倒した数です", 0.25, 0.8, 0.5, 0.02)
PLAYED_AT = "2026/11/10 18:24"


def self_rows(kills: int) -> list[Box]:
    """スクロールした画面に見える 4 人の行（いちばん上が自分）"""
    return [Box(f"オオモノシャケ x{kills if i == 0 else 9}", 0.06, 0.05 + 0.07 * i, 0.18, 0.015) for i in range(4)]


def fake_boss_screens(monkeypatch, screens, played_at_after=PLAYED_AT):
    """read_bosses の画面の操作と読み取りを差し替える。screens はスクロールごとの (OCR の文字, オオモノの行)"""
    window = FakeWindow()
    monkeypatch.setattr(s, "scroll", lambda w, pixels: w.scrolls.append(pixels))
    monkeypatch.setattr(s, "time", type("T", (), {"sleep": staticmethod(lambda seconds: None)}))
    screens = iter(screens)
    current = {"boxes": [], "rows": {}}
    labels = []

    def capture_screen(label):
        labels.append(label)
        if label == "bosses":
            current["boxes"], current["rows"] = next(screens)
        return blank_detail_image()

    monkeypatch.setattr(s, "ocr", lambda image, scale=1: current["boxes"])
    monkeypatch.setattr(s, "read_boss_rows", lambda image, boxes, names: current["rows"])
    # 先頭に戻したあとの日時
    monkeypatch.setattr(s, "read_played_at", lambda image, boxes, ocr_fn=None: played_at_after)
    return window, capture_screen, labels


def test_read_bosses_scrolls_until_the_end_of_the_list_and_back_to_the_top(monkeypatch):
    window, capture_screen, labels = fake_boss_screens(monkeypatch, [
        ([], {"bakudan": (8, 7, 3)}),
        ([END_OF_LIST], {"hebi": (4, 3, 2)}),
    ])
    bosses, kills = s.read_bosses(window, capture_screen, 5, PLAYED_AT, print)
    assert [b["boss"] for b in bosses] == ["bakudan", "hebi"]
    assert kills == 5
    assert window.scrolls == [s.BOSS_SCROLL_PIXELS, s.BOSS_SCROLL_PIXELS, s.SCROLL_TO_TOP_PIXELS]
    # 先頭に戻してから、バイトが切り替わっていないか撮り直す
    assert labels == ["bosses", "bosses", "recheck"]


def test_read_bosses_returns_nothing_when_the_counts_do_not_add_up(monkeypatch):
    window, capture_screen, _ = fake_boss_screens(monkeypatch, [([END_OF_LIST], {"bakudan": (8, 7, 3)})])
    logs = []
    assert s.read_bosses(window, capture_screen, 4, PLAYED_AT, logs.append) == ([], 4)
    assert "合わない" in logs[0]
    assert window.scrolls[-1] == s.SCROLL_TO_TOP_PIXELS


def test_read_bosses_corrects_the_self_kills_misread_on_the_detail_screen(monkeypatch):
    """詳細画面で x33 を 35 と読んでも、スクロールした画面の自分の行（x33）とオオモノの欄の合計が合えば 33 にする"""
    window, capture_screen, _ = fake_boss_screens(monkeypatch, [
        (self_rows(33), {"bakudan": (10, 10, 20)}),
        ([END_OF_LIST], {"hebi": (20, 20, 13)}),
    ])
    logs = []
    bosses, kills = s.read_bosses(window, capture_screen, 35, PLAYED_AT, logs.append)
    assert kills == 33
    assert [b["selfKills"] for b in bosses] == [20, 13]
    assert "読み直しました" in logs[0]


def test_read_bosses_does_not_correct_without_all_the_player_rows(monkeypatch):
    """4 人の行が見えていなければ、いちばん上が自分とは限らないので読み直さない"""
    window, capture_screen, _ = fake_boss_screens(monkeypatch, [
        (self_rows(33)[1:], {"bakudan": (10, 10, 20)}),
        ([END_OF_LIST], {"hebi": (20, 20, 13)}),
    ])
    assert s.read_bosses(window, capture_screen, 35, PLAYED_AT, lambda m: None) == ([], 35)


def test_read_bosses_drops_the_bosses_of_another_job(monkeypatch):
    """イカリング3の読み込みが遅れて、スクロールしている間に別のバイトに切り替わっていたら捨てる"""
    window, capture_screen, _ = fake_boss_screens(monkeypatch, [([END_OF_LIST], {"bakudan": (8, 7, 3)})], played_at_after="2026/11/10 18:31")
    logs = []
    assert s.read_bosses(window, capture_screen, 3, PLAYED_AT, logs.append) == ([], 3)
    assert "別のバイト" in logs[0]


def test_read_bosses_scrolls_back_to_the_top_when_reading_fails(monkeypatch):
    window, _, _ = fake_boss_screens(monkeypatch, [])

    def broken(label):
        raise s.ImportError_("撮影できません")

    with pytest.raises(s.ImportError_):
        s.read_bosses(window, broken, 4, PLAYED_AT, print)
    assert window.scrolls == [s.BOSS_SCROLL_PIXELS, s.SCROLL_TO_TOP_PIXELS]


def test_read_bosses_without_the_end_of_the_list_relies_on_the_total(monkeypatch):
    window, capture_screen, _ = fake_boss_screens(monkeypatch, [([], {"bakudan": (8, 7, 3)})] * s.MAX_BOSS_SCROLLS)
    logs = []
    # 下の注記を読み間違えただけかもしれないので、読めた行の合計が合えば記録する
    bosses, _ = s.read_bosses(window, capture_screen, 3, PLAYED_AT, logs.append)
    assert [b["boss"] for b in bosses] == ["bakudan"]
    assert window.scrolls.count(s.BOSS_SCROLL_PIXELS) == s.MAX_BOSS_SCROLLS
    assert window.scrolls[-1] == s.SCROLL_TO_TOP_PIXELS
    assert "終わり" in logs[0]


def test_read_file_shows_the_bosses_of_a_boss_capture(capsys):
    import json

    s.read_file(FIXTURES / "bosses-clear-2.png", Path("/nonexistent"))
    shown = json.loads(capsys.readouterr().out)
    assert shown["endOfList"] is True
    assert {"boss": "tekkyu", "appearances": 4, "teamKills": 4, "selfKills": 1} in shown["bosses"]


def test_read_waves_keeps_the_column_width_when_a_header_is_missing(monkeypatch):
    """WAVE 2 の見出しが読めなくても、WAVE 1・3 の列は 1 列分の幅で切り出す（隣の WAVE の数字を読まない）"""
    boxes = [Box("WAVE 1", 0.2, 0.4, 0.1, 0.015), Box("WAVE 3", 0.69, 0.4, 0.1, 0.015)]
    crops = []
    original = s.crop_relative
    monkeypatch.setattr(s, "crop_relative", lambda image, box: crops.append(box) or original(image, box))
    waves, _, _ = s.read_waves(blank_detail_image(), boxes, lambda image, scale=1: [])
    assert [w["wave"] for w in waves] == [1, 3]
    column = (0.74 - 0.25) / 2
    assert max(right - left for left, _, right, _ in crops) == pytest.approx(column)


class FakeApi:
    def __init__(self, recorded, celebrated=False):
        self.recorded_played_at = recorded
        self.celebrated = celebrated
        self.updates = []
        self.telops = []

    def update(self, body):
        self.updates.append(body)
        return 200, {"celebrated": self.celebrated} if body["status"] == "succeeded" else {}

    def recorded(self):
        return set(self.recorded_played_at), 0.0

    def telop(self, text):
        self.telops.append(text)


def test_process_request_reads_the_bosses_of_new_jobs_only(monkeypatch, tmp_path):
    """記録済みのバイトに着いたら遡るのをやめ、記録するバイトだけオオモノの欄を読む（詳細が読めないバイトは読まない）"""
    screens = iter([
        ({"bossKills": 26}, "2026/11/10 10:51", {"waves": [], "players": [{"position": 0, "bossKills": 26}]}),
        ({"bossKills": 25}, "2026/11/10 10:42", None),
        ({"bossKills": 33}, "2026/11/10 10:33", {"waves": []}),
    ])
    monkeypatch.setattr(s, "find_mirroring_window", lambda: FakeWindow())
    monkeypatch.setattr(s, "ensure_connected", lambda window, log: None)
    monkeypatch.setattr(s, "open_latest_job", lambda window: None)
    monkeypatch.setattr(s, "open_previous_job", lambda window, played_at: True)
    monkeypatch.setattr(s, "capture", lambda window, path: blank_detail_image())
    monkeypatch.setattr(s, "read_result", lambda image, refs, special_refs, log: next(screens))
    read_for = []

    def fake_read_bosses(window, capture_screen, self_kills, played_at, log):
        read_for.append((self_kills, played_at))
        capture_screen("bosses")
        # 詳細画面の x26 を、オオモノの欄と合う x25 に読み直した
        return [{"boss": "bakudan", "appearances": 25, "teamKills": 25, "selfKills": 25}], 25

    monkeypatch.setattr(s, "read_bosses", fake_read_bosses)
    api = FakeApi({"2026/11/10 10:33"})
    s.process_request(1, api, {}, tmp_path, log=lambda m: None)

    assert read_for == [(26, "2026/11/10 10:51")]
    succeeded = api.updates[-1]
    assert succeeded["status"] == "succeeded"
    assert [j["playedAt"] for j in succeeded["jobs"]] == ["2026/11/10 10:42", "2026/11/10 10:51"]
    assert succeeded["jobs"][0]["details"] is None
    latest = succeeded["jobs"][1]
    assert latest["details"]["bosses"][0]["selfKills"] == 25
    # 読み直したオオモノの数で、バイトと自分の行の数も直す
    assert latest["job"]["bossKills"] == 25
    assert latest["details"]["players"][0]["bossKills"] == 25
    assert [name.rsplit("-", 1)[-1] for name in succeeded["captures"]] == ["detail.png", "bosses.png", "detail.png", "detail.png"]


def test_process_request_keeps_the_details_when_reading_the_bosses_fails(monkeypatch, tmp_path):
    monkeypatch.setattr(s, "find_mirroring_window", lambda: FakeWindow())
    monkeypatch.setattr(s, "ensure_connected", lambda window, log: None)
    monkeypatch.setattr(s, "open_latest_job", lambda window: None)
    monkeypatch.setattr(s, "open_previous_job", lambda window, played_at: False)
    monkeypatch.setattr(s, "capture", lambda window, path: blank_detail_image())
    monkeypatch.setattr(s, "read_result", lambda image, refs, special_refs, log: ({"bossKills": 26}, "2026/11/10 10:51", {"waves": []}))

    def broken(*args, **kwargs):
        raise ValueError("想定外の画面")

    monkeypatch.setattr(s, "read_bosses", broken)
    api = FakeApi(set())
    logs = []
    s.process_request(1, api, {}, tmp_path, log=logs.append)
    assert api.updates[-1]["status"] == "succeeded"
    assert api.updates[-1]["jobs"][0]["details"] == {"waves": []}
    assert any("オオモノの欄を読み取れませんでした" in m for m in logs)


@pytest.mark.parametrize("celebrated, telops", [(False, [s.TELOP_SUCCEEDED]), (True, [])])
def test_process_request_leaves_the_telop_to_the_celebration(monkeypatch, tmp_path, celebrated, telops):
    """本日の最高記録などでサーバーがお祝いのテロップを出したら、「リザルトを記録しました」で上書きしない"""
    monkeypatch.setattr(s, "find_mirroring_window", lambda: FakeWindow())
    monkeypatch.setattr(s, "ensure_connected", lambda window, log: None)
    monkeypatch.setattr(s, "open_latest_job", lambda window: None)
    monkeypatch.setattr(s, "open_previous_job", lambda window, played_at: False)
    monkeypatch.setattr(s, "capture", lambda window, path: blank_detail_image())
    monkeypatch.setattr(s, "read_result", lambda image, refs, special_refs, log: ({"bossKills": 26}, "2026/11/10 10:51", None))
    api = FakeApi(set(), celebrated=celebrated)
    s.process_request(1, api, {}, tmp_path, log=lambda m: None)
    assert api.updates[-1]["status"] == "succeeded"
    assert api.telops == telops


def test_read_hazard_level_from_the_number_even_when_the_label_is_misread():
    """「キケン度」を「約」と読んでも、「%」の付いた文字の右端から数字を切り出して読む"""
    readings = []

    def fake_ocr(image, scale=1):
        readings.append(image.width)
        return [Box("鹿290%", 0, 0, 1, 1)]

    assert s.read_hazard_level(blank_detail_image(), [Box("約290%", 0.6, 0.24, 0.15, 0.02)], fake_ocr) == 290
    assert readings  # 全体の OCR の文字ではなく、切り出して読み直した結果を使う

    def misread(image, scale=1):
        return [Box("准285%", 0, 0, 1, 1)]

    # 全体の OCR が「キケン度85%」（2 が抜けた）でも、切り出した読みの多数決で 285
    assert s.read_hazard_level(blank_detail_image(), [Box("キケン度85%", 0.55, 0.24, 0.2, 0.02)], misread) == 285
    assert s.read_hazard_level(blank_detail_image(), [Box("Clear!!", 0.4, 0.2, 0.2, 0.03)], misread) is None


@pytest.mark.parametrize(("read", "reread", "expected"), [
    (35, 33, True), (1, 17, True), (17, 1, True), (33, 33, False), (35, 23, False), (5, 17, False), (100, 1, False),
])
def test_is_single_digit_misread(read, reread, expected):
    assert s.is_single_digit_misread(read, reread) is expected


def test_read_bosses_does_not_correct_a_distant_number(monkeypatch):
    """詳細画面の数と 2 文字以上違う読み直しは、どちらかの読み間違いが重なっているかもしれないので採用しない"""
    window, capture_screen, _ = fake_boss_screens(monkeypatch, [
        (self_rows(33), {"bakudan": (10, 10, 20)}),
        ([END_OF_LIST], {"hebi": (20, 20, 13)}),
    ])
    assert s.read_bosses(window, capture_screen, 24, PLAYED_AT, lambda m: None) == ([], 24)


def test_read_bosses_keeps_the_bosses_when_the_date_cannot_be_read_again(monkeypatch):
    """先頭に戻した画面の日時が読めなくても、切り替わったとは限らないので、合計が合えば記録する"""
    window, capture_screen, _ = fake_boss_screens(monkeypatch, [([END_OF_LIST], {"bakudan": (8, 7, 3)})], played_at_after=None)
    logs = []
    bosses, _ = s.read_bosses(window, capture_screen, 3, PLAYED_AT, logs.append)
    assert [b["boss"] for b in bosses] == ["bakudan"]
    assert "読めませんでした" in logs[0]


def test_every_glyph_template_reads_as_itself():
    """数字・カッコの形（digit_glyphs.py）は、それぞれ自分の文字にいちばん近い（追加した形がほかの数字と取り違えられない）"""
    from digit_glyphs import GLYPHS

    for char, texts in GLYPHS.items():
        for text in texts:
            distances = s.glyph_distances(s._parse_glyph(text))
            assert min(distances, key=distances.get) == char, (char, text)


def test_read_hazard_level_prefers_the_labeled_percent():
    """「%」の付いた文字が複数あれば、「キケン度」の付いた方を使う"""
    crops = []

    def fake_ocr(image, scale=1):
        crops.append(image.width)
        return [Box("290%", 0, 0, 1, 1)]

    boxes = [Box("50%", 0.1, 0.24, 0.1, 0.02), Box("キケン度290%", 0.55, 0.24, 0.2, 0.02)]
    assert s.read_hazard_level(blank_detail_image(), boxes, fake_ocr) == 290
    # ラベルが無く「%」が 2 つあれば、どちらか分からないので「キケン度」を探す（無ければ読まない）
    assert s.read_hazard_level(blank_detail_image(), [Box("50%", 0.1, 0.24, 0.1, 0.02), Box("約290%", 0.55, 0.24, 0.2, 0.02)], fake_ocr) is None
