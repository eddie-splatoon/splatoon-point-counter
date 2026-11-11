import {getDb} from './db';
import {EX_WAVE, SALMON_BOSSES, isSalmonBossKey, isWaterLevel, salmonBossOrder} from './salmonBosses';
import {
    BossCount,
    BossRanking,
    MAX_COUNT,
    MAX_EVENT_LENGTH,
    MAX_GRADE_NAME_LENGTH,
    MAX_HAZARD_LEVEL,
    MAX_JOB_RATE,
    MAX_KING_NAME_LENGTH,
    MAX_PLAYER_NAME_LENGTH,
    MAX_PLAYERS,
    MAX_STAGE_LENGTH,
    NewSalmonJob,
    SalmonJob,
    SalmonJobDetails,
    SalmonPlayerDetail,
    SalmonSession,
    SalmonSessionWithTotals,
    SalmonSummary,
    SalmonTotals,
    SalmonWaveDetail,
    TEAM_CONTEST_MAX_WAVE,
    isSalmonJobKind,
    maxWaveFor,
} from './salmonTypes';
import {MAX_JOB_WEAPONS, isSalmonSpecialKey, isSalmonWeaponKey} from './salmonWeapons';

const MAX_BOSS_ROWS = SALMON_BOSSES.length;

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
    weapons: string;
    job_kind: string | null;
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
    weapons: parseStoredWeapons(row.weapons),
    jobKind: isSalmonJobKind(row.job_kind) ? row.job_kind : null,
});

/** 保存済みのブキ。壊れた JSON や、定義から消えたブキは捨てる */
export function parseStoredWeapons(value: string): string[] {
    try {
        const parsed: unknown = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.filter(isSalmonWeaponKey) : [];
    } catch {
        return [];
    }
}

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

/**
 * バイトを現在のセッションに記録する。セッションが無ければ自動で作る。
 * playedAt はイカリング3から取り込んだときのバイトの日時（二重に記録しないため。手入力では null）
 */
export function addJob(job: NewSalmonJob, now = Date.now(), playedAt: string | null = null, details: SalmonJobDetails | null = null): SalmonJob {
    const session = getCurrentSession() ?? startSession('', now);
    const db = getDb();
    // 詳細は子テーブルにも書くので、途中で失敗したら記録ごと戻す（呼び出し元がトランザクション中ならそれに含める）
    const ownTransaction = details !== null && !db.isTransaction;
    if (ownTransaction) db.exec('BEGIN');
    try {
        const result = db.prepare(`
            INSERT INTO salmon_jobs (
                session_id, created_at, golden_eggs, boss_kills, deaths, cleared, wave_reached, stage, weapons, played_at, job_kind,
                hazard_level, grade_name, grade_point, job_point, job_score, job_rate_x100, clear_bonus,
                team_golden_eggs, team_power_eggs, scale_bronze, scale_silver, scale_gold, king_name, king_defeated)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
            session.id, now, job.goldenEggs, job.bossKills, job.deaths, job.cleared ? 1 : 0, job.waveReached, job.stage, JSON.stringify(job.weapons), playedAt, job.jobKind,
            details?.hazardLevel ?? null, details?.gradeName ?? null, details?.gradePoint ?? null, details?.jobPoint ?? null,
            details?.jobScore ?? null, details?.jobRate == null ? null : Math.round(details.jobRate * 100), details?.clearBonus ?? null,
            details?.teamGoldenEggs ?? null, details?.teamPowerEggs ?? null, details?.scaleBronze ?? null, details?.scaleSilver ?? null,
            details?.scaleGold ?? null, details?.kingName ?? null, details?.kingDefeated == null ? null : details.kingDefeated ? 1 : 0,
        );
        const id = Number(result.lastInsertRowid);
        if (details) insertDetailRows(id, details);
        if (ownTransaction) db.exec('COMMIT');
        return {...job, id, sessionId: session.id, createdAt: now};
    } catch (error) {
        if (ownTransaction) db.exec('ROLLBACK');
        throw error;
    }
}

function insertDetailRows(jobId: number, details: SalmonJobDetails): void {
    const db = getDb();
    const wave = db.prepare(`
        INSERT INTO salmon_job_waves (job_id, wave, delivered, quota, water_level, event, golden_appearances, specials_used)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const w of details.waves) {
        wave.run(jobId, w.wave, w.delivered, w.quota, w.waterLevel, w.event, w.goldenAppearances, w.specialsUsed);
    }
    const player = db.prepare(`
        INSERT INTO salmon_job_players (job_id, position, name, boss_kills, golden_eggs, golden_assists, power_eggs, rescues, rescued, weapons, special)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const p of details.players) {
        player.run(jobId, p.position, p.name, p.bossKills, p.goldenEggs, p.goldenAssists, p.powerEggs, p.rescues, p.rescued, JSON.stringify(p.weapons), p.special);
    }
    const boss = db.prepare('INSERT INTO salmon_job_bosses (job_id, boss, appearances, team_kills, self_kills) VALUES (?, ?, ?, ?, ?)');
    for (const b of details.bosses) boss.run(jobId, b.boss, b.appearances, b.teamKills, b.selfKills);
}

/** @returns 削除できたら true */
export function deleteJob(id: number): boolean {
    return Number(getDb().prepare('DELETE FROM salmon_jobs WHERE id = ?').run(id).changes) > 0;
}

/** セッションの記録と合計。sessionId を省略すると現在のセッション */
export function getSummary(sessionId?: number): SalmonSummary {
    const session = sessionId === undefined ? getCurrentSession() : getSession(sessionId);
    if (!session) return {session: null, lastJob: null, totals: EMPTY_TOTALS, jobs: [], bossRanking: {lastJob: [], session: []}};

    const db = getDb();
    const jobs = (db.prepare('SELECT * FROM salmon_jobs WHERE session_id = ? ORDER BY id DESC').all(session.id) as unknown as JobRow[]).map(toJob);
    const totals = toTotals(db.prepare(`SELECT ${TOTALS_COLUMNS} FROM salmon_jobs j WHERE j.session_id = ?`).get(session.id) as Record<string, unknown>);
    const lastJob = jobs[0] ?? null;
    return {session, lastJob, totals, jobs, bossRanking: getBossRanking(session.id, lastJob?.id ?? null)};
}

/** 自分の討伐数の多い順（同数ならオオモノの表示順）。0 体は除く */
const rankBosses = (counts: BossCount[]): BossCount[] =>
    counts
        .filter((c) => c.selfKills > 0)
        .sort((a, b) => b.selfKills - a.selfKills || salmonBossOrder(a.boss) - salmonBossOrder(b.boss));

const toBossCounts = (rows: Record<string, unknown>[]): BossCount[] =>
    rows.filter((row) => isSalmonBossKey(row.boss)).map((row) => ({
        boss: row.boss as string,
        selfKills: Number(row.selfKills),
        teamKills: Number(row.teamKills),
        appearances: Number(row.appearances),
    }));

/** 前回のバイト（lastJobId）とセッション全体の、オオモノごとの討伐数。詳細を取り込んでいないバイトは数えない */
export function getBossRanking(sessionId: number, lastJobId: number | null): BossRanking {
    const db = getDb();
    const lastJob = lastJobId === null ? [] : toBossCounts(db.prepare(`
        SELECT boss, self_kills AS selfKills, team_kills AS teamKills, appearances
        FROM salmon_job_bosses WHERE job_id = ?`).all(lastJobId) as Record<string, unknown>[]);
    const session = toBossCounts(db.prepare(`
        SELECT b.boss, SUM(b.self_kills) AS selfKills, SUM(b.team_kills) AS teamKills, SUM(b.appearances) AS appearances
        FROM salmon_job_bosses b JOIN salmon_jobs j ON j.id = b.job_id
        WHERE j.session_id = ? GROUP BY b.boss`).all(sessionId) as Record<string, unknown>[]);
    return {lastJob: rankBosses(lastJob), session: rankBosses(session)};
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
    const {goldenEggs, bossKills, deaths, cleared, waveReached, stage, weapons = [], jobKind = null} = (body ?? {}) as Record<string, unknown>;
    if (!isCount(goldenEggs) || !isCount(bossKills) || !isCount(deaths)) {
        return `goldenEggs, bossKills and deaths must be integers between 0 and ${MAX_COUNT}.`;
    }
    if (typeof cleared !== 'boolean') return 'cleared must be a boolean.';
    // jobKind は後から追加した項目なので省略可（種類がわからない記録は通常の WAVE 数で検証する）
    if (jobKind !== null && !isSalmonJobKind(jobKind)) return 'jobKind must be null or one of regular, bigRun, teamContest.';
    const maxWave = maxWaveFor(jobKind);
    // クリア時は最終 WAVE まで到達しているので省略可。失敗時はどの WAVE で失敗したかが必須
    const wave = cleared && waveReached === undefined ? maxWave : waveReached;
    if (typeof wave !== 'number' || !Number.isInteger(wave) || wave < 1 || wave > maxWave || (cleared && wave !== maxWave)) {
        return `waveReached must be 1-${maxWave} (${maxWave} when cleared).`;
    }
    if (stage !== undefined && typeof stage !== 'string') return 'stage must be a string.';
    // weapons は後から追加した項目なので省略可（ブキを記録しない）。同じブキが2回支給されることもあるので重複は許す
    if (!Array.isArray(weapons) || weapons.length > MAX_JOB_WEAPONS || !weapons.every(isSalmonWeaponKey)) {
        return `weapons must be an array of up to ${MAX_JOB_WEAPONS} known weapon keys.`;
    }
    return {goldenEggs, bossKills, deaths, cleared, waveReached: wave, stage: (stage ?? '').trim().slice(0, MAX_STAGE_LENGTH), weapons, jobKind};
}

// ---- バイトの詳細（イカリング3から取り込んだとき）の検証 ----

const isNullableCount = (value: unknown): value is number | null => value === null || isCount(value);

/** 名前などの文字列。全角をそろえ、制御文字を除いて長さを切り詰める。空なら null */
const toText = (value: unknown, maxLength: number): string | null => {
    if (typeof value !== 'string') return null;
    const text = value.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, '').trim();
    return text === '' ? null : Array.from(text).slice(0, maxLength).join('');
};

const isOptionalText = (value: unknown): boolean => value === undefined || value === null || typeof value === 'string';

function parseWave(value: unknown): SalmonWaveDetail | string {
    const {wave, delivered = null, quota = null, waterLevel = null, event = null, goldenAppearances = null, specialsUsed = null} = (value ?? {}) as Record<string, unknown>;
    if (typeof wave !== 'number' || !Number.isInteger(wave) || ((wave < 1 || wave > TEAM_CONTEST_MAX_WAVE) && wave !== EX_WAVE)) {
        return `waves[].wave must be 1-${TEAM_CONTEST_MAX_WAVE} or ${EX_WAVE} (EX-WAVE).`;
    }
    if (![delivered, quota, goldenAppearances, specialsUsed].every(isNullableCount)) {
        return `waves[] counts must be null or integers between 0 and ${MAX_COUNT}.`;
    }
    if (waterLevel !== null && !isWaterLevel(waterLevel)) return 'waves[].waterLevel must be null or a known water level.';
    if (!isOptionalText(event)) return 'waves[].event must be null or a string.';
    return {
        wave,
        delivered: delivered as number | null,
        quota: quota as number | null,
        waterLevel,
        // 「-」（イベントなし）は空文字にそろえる
        event: event === null ? null : (toText(event, MAX_EVENT_LENGTH) ?? '').replace(/^[-‐ー−]$/, ''),
        goldenAppearances: goldenAppearances as number | null,
        specialsUsed: specialsUsed as number | null,
    };
}

function parsePlayer(value: unknown): SalmonPlayerDetail | string {
    const {
        position, name = null, bossKills = null, goldenEggs = null, goldenAssists = null, powerEggs = null, rescues = null, rescued = null,
        weapons = [], special = null,
    } = (value ?? {}) as Record<string, unknown>;
    if (typeof position !== 'number' || !Number.isInteger(position) || position < 0 || position >= MAX_PLAYERS) {
        return `players[].position must be 0-${MAX_PLAYERS - 1}.`;
    }
    if (![bossKills, goldenEggs, goldenAssists, powerEggs, rescues, rescued].every(isNullableCount)) {
        return `players[] counts must be null or integers between 0 and ${MAX_COUNT}.`;
    }
    if (!isOptionalText(name)) return 'players[].name must be null or a string.';
    if (!Array.isArray(weapons) || weapons.length > MAX_JOB_WEAPONS || !weapons.every(isSalmonWeaponKey)) {
        return `players[].weapons must be an array of up to ${MAX_JOB_WEAPONS} known weapon keys.`;
    }
    if (special !== null && !isSalmonSpecialKey(special)) return 'players[].special must be null or a known special key.';
    return {
        position, name: toText(name, MAX_PLAYER_NAME_LENGTH),
        bossKills: bossKills as number | null, goldenEggs: goldenEggs as number | null, goldenAssists: goldenAssists as number | null,
        powerEggs: powerEggs as number | null, rescues: rescues as number | null, rescued: rescued as number | null,
        weapons, special,
    };
}

function parseBoss(value: unknown): BossCount | string {
    const {boss, appearances, teamKills, selfKills} = (value ?? {}) as Record<string, unknown>;
    if (!isSalmonBossKey(boss)) return 'bosses[].boss must be a known boss key.';
    if (!isCount(appearances) || !isCount(teamKills) || !isCount(selfKills)) {
        return `bosses[] counts must be integers between 0 and ${MAX_COUNT}.`;
    }
    if (selfKills > teamKills || teamKills > appearances) return 'bosses[] must satisfy selfKills <= teamKills <= appearances.';
    return {boss, appearances, teamKills, selfKills};
}

/** 配列の各要素を検証する。キー（WAVE の番号など）の重複も不正とする */
function parseList<T>(value: unknown, name: string, max: number, parse: (item: unknown) => T | string, key: (item: T) => unknown): T[] | string {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > max) return `${name} must be an array of up to ${max} items.`;
    const items: T[] = [];
    for (const item of value) {
        const parsed = parse(item);
        if (typeof parsed === 'string') return parsed;
        if (items.some((other) => key(other) === key(parsed))) return `${name} must not contain duplicates.`;
        items.push(parsed);
    }
    return items;
}

/** 取り込みの PATCH のバイトの詳細を検証する。不正ならエラーメッセージ。読めなかった項目は null・省略でよい */
export function parseJobDetails(body: unknown): SalmonJobDetails | string {
    const record = (body ?? {}) as Record<string, unknown>;
    const {
        hazardLevel = null, gradeName = null, gradePoint = null, jobPoint = null, jobScore = null, jobRate = null, clearBonus = null,
        teamGoldenEggs = null, teamPowerEggs = null, scaleBronze = null, scaleSilver = null, scaleGold = null,
        kingName = null, kingDefeated = null,
    } = record;
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return 'details must be an object.';
    if (hazardLevel !== null && (typeof hazardLevel !== 'number' || !Number.isInteger(hazardLevel) || hazardLevel < 0 || hazardLevel > MAX_HAZARD_LEVEL)) {
        return `details.hazardLevel must be null or an integer between 0 and ${MAX_HAZARD_LEVEL}.`;
    }
    if (![gradePoint, jobPoint, jobScore, clearBonus, teamGoldenEggs, teamPowerEggs, scaleBronze, scaleSilver, scaleGold].every(isNullableCount)) {
        return `details counts must be null or integers between 0 and ${MAX_COUNT}.`;
    }
    if (jobRate !== null && (typeof jobRate !== 'number' || !Number.isFinite(jobRate) || jobRate < 0 || jobRate > MAX_JOB_RATE)) {
        return `details.jobRate must be null or a number between 0 and ${MAX_JOB_RATE}.`;
    }
    if (!isOptionalText(gradeName) || !isOptionalText(kingName)) return 'details.gradeName and kingName must be null or strings.';
    if (kingDefeated !== null && typeof kingDefeated !== 'boolean') return 'details.kingDefeated must be null or a boolean.';
    const waves = parseList(record.waves, 'details.waves', TEAM_CONTEST_MAX_WAVE, parseWave, (w) => w.wave);
    if (typeof waves === 'string') return waves;
    const players = parseList(record.players, 'details.players', MAX_PLAYERS, parsePlayer, (p) => p.position);
    if (typeof players === 'string') return players;
    const bosses = parseList(record.bosses, 'details.bosses', MAX_BOSS_ROWS, parseBoss, (b) => b.boss);
    if (typeof bosses === 'string') return bosses;
    return {
        hazardLevel: hazardLevel as number | null,
        gradeName: toText(gradeName, MAX_GRADE_NAME_LENGTH),
        gradePoint: gradePoint as number | null,
        jobPoint: jobPoint as number | null,
        jobScore: jobScore as number | null,
        jobRate: jobRate === null ? null : Math.round((jobRate as number) * 100) / 100,
        clearBonus: clearBonus as number | null,
        teamGoldenEggs: teamGoldenEggs as number | null,
        teamPowerEggs: teamPowerEggs as number | null,
        scaleBronze: scaleBronze as number | null,
        scaleSilver: scaleSilver as number | null,
        scaleGold: scaleGold as number | null,
        kingName: toText(kingName, MAX_KING_NAME_LENGTH),
        kingDefeated: kingDefeated as boolean | null,
        waves: waves.sort((a, b) => a.wave - b.wave),
        players: players.sort((a, b) => a.position - b.position),
        bosses,
    };
}
