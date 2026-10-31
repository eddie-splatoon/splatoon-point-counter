// サーモンラン記録の型と定数。クライアント（コントロールパネル・オーバーレイ）からも使うため、
// DB（node:sqlite）に依存する lib/salmon.ts とは分けている

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

export interface SalmonSummary {
    session: SalmonSession | null;
    lastJob: SalmonJob | null;
    totals: SalmonTotals;
    jobs: SalmonJob[]; // 新しい順
}

export interface SalmonSessionWithTotals extends SalmonSession {
    totals: SalmonTotals;
}

export type NewSalmonJob = Omit<SalmonJob, 'id' | 'sessionId' | 'createdAt'>;
