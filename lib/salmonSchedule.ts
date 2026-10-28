// サーモンランのスケジュール（spla3.yuu26.com の非公式 API）の型と変換。クライアントからも使うため DB や fetch に依存させない

export type SalmonScheduleKind = 'regular' | 'bigRun' | 'teamContest';

export const SALMON_SCHEDULE_KIND_LABELS: Record<SalmonScheduleKind, string> = {
    regular: 'サーモンラン',
    bigRun: 'ビッグラン',
    teamContest: 'バイトチームコンテスト',
};

export interface SalmonScheduleEntry {
    kind: SalmonScheduleKind;
    startTime: number; // エポックミリ秒
    endTime: number;
    stage: {name: string; image: string};
    weapons: {name: string; image: string}[];
}

export interface SalmonScheduleData {
    entries: SalmonScheduleEntry[];
    fetchedAt: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const toImage = (value: unknown): {name: string; image: string} | null => {
    if (!isRecord(value) || typeof value.name !== 'string' || typeof value.image !== 'string') return null;
    return {name: value.name, image: value.image};
};

/** API の results を表示用に変換する。形が想定と違う要素は捨てる（非公式 API なので仕様変更に備える） */
export function parseScheduleResults(body: unknown, isTeamContest: boolean): SalmonScheduleEntry[] {
    const results = isRecord(body) && Array.isArray(body.results) ? body.results : [];
    const entries: SalmonScheduleEntry[] = [];
    for (const result of results) {
        if (!isRecord(result)) continue;
        const startTime = Date.parse(String(result.start_time));
        const endTime = Date.parse(String(result.end_time));
        const stage = toImage(result.stage);
        const weapons = Array.isArray(result.weapons) ? result.weapons.map(toImage) : [];
        if (Number.isNaN(startTime) || Number.isNaN(endTime) || !stage || weapons.some((w) => w === null)) continue;
        const kind: SalmonScheduleKind = isTeamContest ? 'teamContest' : result.is_big_run === true ? 'bigRun' : 'regular';
        entries.push({kind, startTime, endTime, stage, weapons: weapons as {name: string; image: string}[]});
    }
    return entries;
}

// 同じ時間帯に複数開催されているときは、特別なものを優先して表示する
const KIND_PRIORITY: Record<SalmonScheduleKind, number> = {teamContest: 0, bigRun: 1, regular: 2};

/** いま開催中のスケジュール。バイトチームコンテスト > ビッグラン > 通常の順に優先する */
export function pickCurrentSchedule(entries: SalmonScheduleEntry[], now: number): SalmonScheduleEntry | null {
    const current = entries.filter((e) => e.startTime <= now && now < e.endTime);
    current.sort((a, b) => KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind]);
    return current[0] ?? null;
}

/** 終了までの残り時間（「残り 1時間23分」など）。分単位で切り上げる */
export function formatRemaining(endTime: number, now: number): string {
    const minutes = Math.max(0, Math.ceil((endTime - now) / 60_000));
    const hours = Math.floor(minutes / 60);
    if (hours >= 24) return `残り ${Math.floor(hours / 24)}日${hours % 24}時間`;
    if (hours > 0) return `残り ${hours}時間${minutes % 60}分`;
    return `残り ${minutes}分`;
}
