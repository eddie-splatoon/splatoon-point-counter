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
        wave(4, None, None, "普通", 66, 3),
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
}


@pytest.mark.parametrize("label", ["failure", "clear", "kingpin"])
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


def glyph(text: str):
    return s._parse_glyph(text)


def test_read_kills_tells_the_closing_paren_from_one():
    from digit_glyphs import GLYPHS

    four, open_paren, two, close_paren, one = (glyph(GLYPHS[c][0]) for c in ("4", "(", "2", ")", "1"))
    assert s.read_kills([four, open_paren, two, close_paren]) == (4, 2)
    assert s.read_kills([one, one]) == (11, 0)
    assert s.read_kills([]) is None


def test_is_slash():
    slash = glyph("....##/....##/...##./...##./..##../..##../.##.../.##.../##..../##....")
    seven = glyph("######/######/....##/....##/...##./...##./..##../..##../.##.../.##...")
    assert s.is_slash(slash)
    assert not s.is_slash(seven)


class FakeWindow:
    def __init__(self):
        self.scrolls = []


def test_read_bosses_scrolls_until_the_end_of_the_list_and_back_to_the_top(monkeypatch):
    window = FakeWindow()
    monkeypatch.setattr(s, "scroll", lambda w, pixels: w.scrolls.append(pixels))
    monkeypatch.setattr(s, "time", type("T", (), {"sleep": staticmethod(lambda seconds: None)}))
    screens = iter([
        ([], {"bakudan": (8, 7, 3)}),
        ([Box("※カッコ内の数字は自分で倒した数です", 0.25, 0.8, 0.5, 0.02)], {"hebi": (4, 3, 2)}),
    ])
    current = {}

    def capture_screen(label):
        current["boxes"], current["rows"] = next(screens)
        return blank_detail_image()

    monkeypatch.setattr(s, "ocr", lambda image, scale=1: current["boxes"])
    monkeypatch.setattr(s, "read_boss_rows", lambda image, boxes, names: current["rows"])
    logs = []
    assert [b["boss"] for b in s.read_bosses(window, capture_screen, 5, logs.append)] == ["bakudan", "hebi"]
    assert window.scrolls == [s.BOSS_SCROLL_PIXELS, s.BOSS_SCROLL_PIXELS, s.SCROLL_TO_TOP_PIXELS]


def test_read_bosses_returns_nothing_when_the_counts_do_not_add_up(monkeypatch):
    window = FakeWindow()
    monkeypatch.setattr(s, "scroll", lambda w, pixels: w.scrolls.append(pixels))
    monkeypatch.setattr(s, "time", type("T", (), {"sleep": staticmethod(lambda seconds: None)}))
    monkeypatch.setattr(s, "ocr", lambda image, scale=1: [Box("※カッコ内の数字は自分で倒した数です", 0.25, 0.8, 0.5, 0.02)])
    monkeypatch.setattr(s, "read_boss_rows", lambda image, boxes, names: {"bakudan": (8, 7, 3)})
    logs = []
    assert s.read_bosses(window, lambda label: blank_detail_image(), 4, logs.append) == []
    assert "合わない" in logs[0]
    assert window.scrolls[-1] == s.SCROLL_TO_TOP_PIXELS


def test_read_bosses_scrolls_back_to_the_top_when_reading_fails(monkeypatch):
    window = FakeWindow()
    monkeypatch.setattr(s, "scroll", lambda w, pixels: w.scrolls.append(pixels))
    monkeypatch.setattr(s, "time", type("T", (), {"sleep": staticmethod(lambda seconds: None)}))

    def broken(label):
        raise s.ImportError_("撮影できません")

    with pytest.raises(s.ImportError_):
        s.read_bosses(window, broken, 4, print)
    assert window.scrolls == [s.BOSS_SCROLL_PIXELS, s.SCROLL_TO_TOP_PIXELS]


def test_read_bosses_without_the_end_of_the_list_relies_on_the_total(monkeypatch):
    window = FakeWindow()
    monkeypatch.setattr(s, "scroll", lambda w, pixels: w.scrolls.append(pixels))
    monkeypatch.setattr(s, "time", type("T", (), {"sleep": staticmethod(lambda seconds: None)}))
    monkeypatch.setattr(s, "ocr", lambda image, scale=1: [])
    monkeypatch.setattr(s, "read_boss_rows", lambda image, boxes, names: {"bakudan": (8, 7, 3)})
    logs = []
    # 下の注記を読み間違えただけかもしれないので、読めた行の合計が合えば記録する
    assert [b["boss"] for b in s.read_bosses(window, lambda label: blank_detail_image(), 3, logs.append)] == ["bakudan"]
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
    def __init__(self, recorded):
        self.recorded_played_at = recorded
        self.updates = []

    def update(self, body):
        self.updates.append(body)
        return 200

    def recorded(self):
        return set(self.recorded_played_at), 0.0

    def telop(self, text):
        pass


def test_process_request_reads_the_bosses_of_new_jobs_only(monkeypatch, tmp_path):
    """記録済みのバイトに着いたら遡るのをやめ、記録するバイトだけオオモノの欄を読む（詳細が読めないバイトは読まない）"""
    screens = iter([
        ({"bossKills": 26}, "2026/11/10 10:51", {"waves": []}),
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

    def fake_read_bosses(window, capture_screen, self_kills, log):
        read_for.append(self_kills)
        capture_screen("bosses")
        return [{"boss": "bakudan", "appearances": 1, "teamKills": 1, "selfKills": self_kills}]

    monkeypatch.setattr(s, "read_bosses", fake_read_bosses)
    api = FakeApi({"2026/11/10 10:33"})
    s.process_request(1, api, {}, tmp_path, log=lambda m: None)

    assert read_for == [26]
    succeeded = api.updates[-1]
    assert succeeded["status"] == "succeeded"
    assert [j["playedAt"] for j in succeeded["jobs"]] == ["2026/11/10 10:42", "2026/11/10 10:51"]
    assert succeeded["jobs"][0]["details"] is None
    assert succeeded["jobs"][1]["details"]["bosses"][0]["selfKills"] == 26
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
