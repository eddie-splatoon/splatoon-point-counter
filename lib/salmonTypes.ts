// サーモンラン記録の型と定数。クライアント（コントロールパネル・オーバーレイ）からも使うため、
// DB（node:sqlite）に依存する lib/salmon.ts とは分けている

import {WaterLevel} from './salmonBosses';

// サーモンラン1回あたりの WAVE 数（クリア時の到達 WAVE）
export const MAX_WAVE = 3;
// 1回のバイトの金イクラ・オオモノ・デスの上限（入力ミスや異常値で合計が壊れないように）
export const MAX_COUNT = 9999;
export const MAX_STAGE_LENGTH = 50;
export const MAX_TITLE_LENGTH = 50;

export interface SalmonSession {
    id: number;
    startedAt: number;
    title: string;
}

export interface SalmonJob {
    id: number;
    sessionId: number;
    createdAt: number;
    goldenEggs: number;
    bossKills: number;
    deaths: number;
    cleared: boolean;
    waveReached: number;
    stage: string;
    weapons: string[]; // 支給されたブキの key（lib/salmonWeapons.ts）。WAVE ごとに変わるので最大 MAX_JOB_WEAPONS 個
}

export interface SalmonTotals {
    jobs: number;
    goldenEggs: number;
    bossKills: number;
    deaths: number;
    clears: number;
    failures: number;
}

/** オオモノ 1 種類の数（自分の討伐数で順位を付ける） */
export interface BossCount {
    boss: string; // lib/salmonBosses.ts の key
    selfKills: number;
    teamKills: number;
    appearances: number;
}

export interface BossRanking {
    lastJob: BossCount[]; // 前回のバイト（詳細を取り込んでいなければ空）
    session: BossCount[]; // セッションの合計
}

export interface SalmonSummary {
    session: SalmonSession | null;
    lastJob: SalmonJob | null;
    totals: SalmonTotals;
    jobs: SalmonJob[]; // 新しい順
    bossRanking: BossRanking; // 自分の討伐数の多い順（0 体は除く）
}

export interface SalmonSessionWithTotals extends SalmonSession {
    totals: SalmonTotals;
}

export type NewSalmonJob = Omit<SalmonJob, 'id' | 'sessionId' | 'createdAt'>;

// ---- イカリング3から取り込んだバイトの詳細（手入力の記録には無い）。読めなかった項目は null ----

export const MAX_HAZARD_LEVEL = 999; // キケン度（%）
export const MAX_JOB_RATE = 99; // 評価レート
export const MAX_GRADE_NAME_LENGTH = 30;
export const MAX_EVENT_LENGTH = 30;
export const MAX_KING_NAME_LENGTH = 30;
export const MAX_PLAYER_NAME_LENGTH = 30;
export const MAX_PLAYERS = 4;

export interface SalmonWaveDetail {
    wave: number; // 1〜3。EX-WAVE は EX_WAVE（4）
    delivered: number | null; // 金イクラの納品数
    quota: number | null; // ノルマ（EX-WAVE には無い）
    waterLevel: WaterLevel | null;
    event: string | null; // 「-」（イベントなし）は空文字
    goldenAppearances: number | null; // 金イクラの出現数
    specialsUsed: number | null; // 使われたスペシャルの数
}

export interface SalmonPlayerDetail {
    position: number; // 0 が自分（プレイヤーの一覧のいちばん上）
    name: string | null; // DB に残すだけで、API・配信画面・ログには出さない
    bossKills: number | null;
    goldenEggs: number | null;
    goldenAssists: number | null;
    powerEggs: number | null;
    rescues: number | null;
    rescued: number | null;
    weapons: string[]; // lib/salmonWeapons.ts の key
    special: string | null; // lib/salmonWeapons.ts の SALMON_SPECIALS の key
}

export interface SalmonJobDetails {
    hazardLevel: number | null; // キケン度（%）
    gradeName: string | null; // 評価（でんせつ など）
    gradePoint: number | null;
    jobPoint: number | null; // 獲得ポイント
    jobScore: number | null; // バイトスコア
    jobRate: number | null; // 評価レート（3.25 など）
    clearBonus: number | null;
    teamGoldenEggs: number | null;
    teamPowerEggs: number | null;
    scaleBronze: number | null;
    scaleSilver: number | null;
    scaleGold: number | null;
    kingName: string | null; // EX-WAVE のオカシラ（出なければ null）
    kingDefeated: boolean | null;
    waves: SalmonWaveDetail[];
    players: SalmonPlayerDetail[];
    bosses: BossCount[];
}

// ---- 配信の最後に出す振り返り（/api/salmon/review）。味方の名前は含めない ----

/** 振り返りのグラフに出すバイト 1 件（古い順に並べる） */
export interface SalmonReviewJob {
    id: number;
    goldenEggs: number;
    bossKills: number;
    deaths: number;
    cleared: boolean;
    waveReached: number;
    stage: string;
    hazardLevel: number | null; // 取り込んだバイトだけ
}

export interface SalmonGrade {
    name: string;
    point: number;
}

/** チームの金イクラ納品数のハイスコア 1 件 */
export interface SalmonTeamHighScore {
    jobId: number;
    jobNumber: number; // セッションの何バイト目か（1 から）
    teamGoldenEggs: number;
    hazardLevel: number | null;
    cleared: boolean;
}

export interface SalmonSessionReview {
    session: SalmonSession | null;
    totals: SalmonTotals;
    jobs: SalmonReviewJob[]; // 古い順
    detailedJobs: number; // 詳細を取り込んだバイトの数（下の詳細の集計はこのバイトだけ）
    powerEggs: number; // 自分の赤イクラ
    rescues: number; // 自分が助けた数
    goldenAssists: number;
    jobPoints: number; // 獲得ポイントの合計
    maxHazardLevel: number | null;
    scales: {bronze: number; silver: number; gold: number};
    firstGrade: SalmonGrade | null; // セッションの最初と最後の評価
    lastGrade: SalmonGrade | null;
    waveFailures: number[]; // WAVE 1〜3 で失敗した数（[W1, W2, W3]）
    kings: {appeared: number; defeated: number}; // オカシラ（EX-WAVE）
    bosses: BossCount[]; // 出現したオオモノすべて（自分の討伐数の多い順）
    bestJobId: number | null; // 金イクラがいちばん多いバイト
    teamHighScores: SalmonTeamHighScore[]; // チームの金イクラ納品数の多い順（取り込んだバイトだけ。REVIEW_HIGH_SCORE_LIMIT 件まで）
    weapons: {key: string; count: number}[]; // 支給された回数の多い順
    newWeapons: string[]; // このセッション中にブキ埋めカードで埋まったブキ（埋まった順）。今のカードの分だけ（新しいカードを始めると、それより前の分は出ない）
    challenges: {done: number; total: number} | null; // 本日のお題（今のセッションのときだけ）
    clips: number; // このセッション中に作ったクリップ
}
