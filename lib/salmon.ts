import {getDb} from './db';
import {
    MAX_COUNT,
    MAX_STAGE_LENGTH,
    MAX_WAVE,
    NewSalmonJob,
    SalmonJob,
    SalmonSession,
    SalmonSessionWithTotals,
    SalmonSummary,
    SalmonTotals,
} from './salmonTypes';

interface SessionRow {
    id: number;
    started_at: number;
    title: string;
}

interface JobRow {
    id: number;
    session_id: number;
    created_at: number;
    golden_eggs: number;
    boss_kills: number;
    deaths: number;
    cleared: number;
    wave_reached: number;
    stage: string;
}

const toSession = (row: SessionRow): SalmonSession => ({id: row.id, startedAt: row.started_at, title: row.title});

const toJob = (row: JobRow): SalmonJob => ({
    id: row.id,
    sessionId: row.session_id,
    createdAt: row.created_at,
    goldenEggs: row.golden_eggs,
    bossKills: row.boss_kills,
    deaths: row.deaths,
    cleared: row.cleared === 1,
    waveReached: row.wave_reached,
    stage: row.stage,
});

const TOTALS_COLUMNS = `
    COUNT(j.id) AS jobs,
    COALESCE(SUM(j.golden_eggs), 0) AS goldenEggs,
    COALESCE(SUM(j.boss_kills), 0) AS bossKills,
    COALESCE(SUM(j.deaths), 0) AS deaths,
    COALESCE(SUM(j.cleared), 0) AS clears,
    COALESCE(SUM(1 - j.cleared), 0) AS failures`;

const toTotals = (row: Record<string, unknown>): SalmonTotals => ({
    jobs: Number(row.jobs),
    goldenEggs: Number(row.goldenEggs),
    bossKills: Number(row.bossKills),
    deaths: Number(row.deaths),
    clears: Number(row.clears),
    failures: Number(row.failures),
});

const EMPTY_TOTALS: SalmonTotals = {jobs: 0, goldenEggs: 0, bossKills: 0, deaths: 0, clears: 0, failures: 0};

/** 最後に開始したセッションを「現在のセッション」とする */
export function getCurrentSession(): SalmonSession | null {
    const row = getDb().prepare('SELECT * FROM salmon_sessions ORDER BY id DESC LIMIT 1').get() as SessionRow | undefined;
    return row ? toSession(row) : null;
}

export function getSession(id: number): SalmonSession | null {
    const row = getDb().prepare('SELECT * FROM salmon_sessions WHERE id = ?').get(id) as SessionRow | undefined;
    return row ? toSession(row) : null;
}

export function startSession(title = '', now = Date.now()): SalmonSession {
    const result = getDb().prepare('INSERT INTO salmon_sessions (started_at, title) VALUES (?, ?)').run(now, title);
    return {id: Number(result.lastInsertRowid), startedAt: now, title};
}

export function listSessions(): SalmonSessionWithTotals[] {
    const rows = getDb().prepare(`
        SELECT s.*, ${TOTALS_COLUMNS}
        FROM salmon_sessions s LEFT JOIN salmon_jobs j ON j.session_id = s.id
        GROUP BY s.id ORDER BY s.id DESC`).all() as (SessionRow & Record<string, unknown>)[];
    return rows.map((row) => ({...toSession(row), totals: toTotals(row)}));
}

/** バイトを現在のセッションに記録する。セッションが無ければ自動で作る */
export function addJob(job: NewSalmonJob, now = Date.now()): SalmonJob {
    const session = getCurrentSession() ?? startSession('', now);
    const result = getDb().prepare(`
        INSERT INTO salmon_jobs (session_id, created_at, golden_eggs, boss_kills, deaths, cleared, wave_reached, stage)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
        session.id, now, job.goldenEggs, job.bossKills, job.deaths, job.cleared ? 1 : 0, job.waveReached, job.stage,
    );
    return {...job, id: Number(result.lastInsertRowid), sessionId: session.id, createdAt: now};
}

/** @returns 削除できたら true */
export function deleteJob(id: number): boolean {
    return Number(getDb().prepare('DELETE FROM salmon_jobs WHERE id = ?').run(id).changes) > 0;
}

/** セッションの記録と合計。sessionId を省略すると現在のセッション */
export function getSummary(sessionId?: number): SalmonSummary {
    const session = sessionId === undefined ? getCurrentSession() : getSession(sessionId);
    if (!session) return {session: null, lastJob: null, totals: EMPTY_TOTALS, jobs: []};

    const db = getDb();
    const jobs = (db.prepare('SELECT * FROM salmon_jobs WHERE session_id = ? ORDER BY id DESC').all(session.id) as unknown as JobRow[]).map(toJob);
    const totals = toTotals(db.prepare(`SELECT ${TOTALS_COLUMNS} FROM salmon_jobs j WHERE j.session_id = ?`).get(session.id) as Record<string, unknown>);
    return {session, lastJob: jobs[0] ?? null, totals, jobs};
}

// ---- API 入力の検証 ----

const isCount = (value: unknown): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_COUNT;

export const parseId = (value: string | null): number | null => {
    if (value === null || !/^[1-9]\d*$/.test(value)) return null;
    return Number(value);
};

/** POST の本文を検証して記録できる形にする。不正ならエラーメッセージを返す */
export function parseJob(body: unknown): NewSalmonJob | string {
    const {goldenEggs, bossKills, deaths, cleared, waveReached, stage} = (body ?? {}) as Record<string, unknown>;
    if (!isCount(goldenEggs) || !isCount(bossKills) || !isCount(deaths)) {
        return `goldenEggs, bossKills and deaths must be integers between 0 and ${MAX_COUNT}.`;
    }
    if (typeof cleared !== 'boolean') return 'cleared must be a boolean.';
    // クリア時は最終 WAVE まで到達しているので省略可。失敗時はどの WAVE で失敗したかが必須
    const wave = cleared && waveReached === undefined ? MAX_WAVE : waveReached;
    if (typeof wave !== 'number' || !Number.isInteger(wave) || wave < 1 || wave > MAX_WAVE || (cleared && wave !== MAX_WAVE)) {
        return `waveReached must be 1-${MAX_WAVE} (${MAX_WAVE} when cleared).`;
    }
    if (stage !== undefined && typeof stage !== 'string') return 'stage must be a string.';
    return {goldenEggs, bossKills, deaths, cleared, waveReached: wave, stage: (stage ?? '').trim().slice(0, MAX_STAGE_LENGTH)};
}
