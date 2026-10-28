import {NextResponse} from 'next/server';

import {SalmonScheduleData, parseScheduleResults} from '../../../lib/salmonSchedule';

// 非公式 API（https://spla3.yuu26.com/）。利用規約に従い、連絡先入りの User-Agent を付け、短時間に大量アクセスしない
const SCHEDULE_URL = 'https://spla3.yuu26.com/api/coop-grouping/schedule';
const TEAM_CONTEST_URL = 'https://spla3.yuu26.com/api/coop-grouping-team-contest/schedule';
const USER_AGENT = 'splatoon-point-counter (+https://github.com/eddie-splatoon/splatoon-point-counter)';
// オーバーレイは2秒ごとに問い合わせるので、外部 API へのアクセスはここで5分に1回までに抑える
export const CACHE_TTL_MS = 5 * 60_000;
// 取得に失敗したら、しばらくは再取得しない（障害中に2秒ごとに叩き続けないように）
export const RETRY_AFTER_FAILURE_MS = 60_000;

let cache: SalmonScheduleData | null = null;
let inflight: Promise<SalmonScheduleData> | null = null;
let retryAt = 0;

/**
 * **FOR TESTING PURPOSES ONLY**
 * Clears the cached schedule.
 */
export function __TEST_ONLY_resetSalmonScheduleCache() {
    cache = null;
    inflight = null;
    retryAt = 0;
}

async function fetchJson(url: string): Promise<unknown> {
    const res = await fetch(url, {headers: {'User-Agent': USER_AGENT}, cache: 'no-store'});
    if (!res.ok) throw new Error(`${url} returned ${res.status}`);
    return res.json();
}

async function fetchSchedule(): Promise<SalmonScheduleData> {
    // チームコンテストは開催されていないことが多い補助的な情報なので、取れなくても通常のスケジュールは返す
    const [schedule, teamContest] = await Promise.all([fetchJson(SCHEDULE_URL), fetchJson(TEAM_CONTEST_URL).catch(() => null)]);
    const entries = [...parseScheduleResults(schedule, false), ...parseScheduleResults(teamContest, true)];
    if (entries.length === 0) throw new Error('The schedule API returned no usable entries.');
    return {entries, fetchedAt: Date.now()};
}

/** サーモンランのスケジュール。取得に失敗したら直前に取れた値を返す */
export async function GET() {
    const expired = !cache || Date.now() - cache.fetchedAt >= CACHE_TTL_MS;
    if (expired && Date.now() >= retryAt) {
        // 同時に来たリクエストで外部 API を重複して叩かない
        inflight ??= fetchSchedule().finally(() => {
            inflight = null;
        });
        try {
            cache = await inflight;
        } catch (error) {
            console.error('Failed to fetch the salmon run schedule:', error);
            retryAt = Date.now() + RETRY_AFTER_FAILURE_MS;
        }
    }
    if (!cache) return NextResponse.json({message: 'Failed to fetch the salmon run schedule.'}, {status: 502});
    return NextResponse.json(cache);
}
