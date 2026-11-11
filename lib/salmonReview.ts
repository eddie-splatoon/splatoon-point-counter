// 配信の最後に出す振り返り（/api/salmon/review）の集計。サーバー専用（node:sqlite に依存する）。
// 味方の名前（salmon_job_players.name）は読まない

import {getAppState, getDb} from './db';
import {getCurrentSession, getSession, getSummary} from './salmon';
import {salmonBossOrder} from './salmonBosses';
import {BossCount, MAX_WAVE, SalmonGrade, SalmonSession, SalmonSessionReview, TEAM_CONTEST_MAX_WAVE} from './salmonTypes';
import {SIDE_PANEL_STATE_KEY, parseSidePanelSettings} from './sidePanelTypes';
import {getWeaponCard} from './weaponCard';

// 支給ブキの回数を何位まで返すか
export const REVIEW_WEAPON_LIMIT = 5;
// チームの金イクラ納品数のハイスコアを何位まで返すか
export const REVIEW_HIGH_SCORE_LIMIT = 5;

interface ReviewJobRow {
    id: number;
    golden_eggs: number;
    boss_kills: number;
    deaths: number;
    cleared: number;
    wave_reached: number;
    stage: string;
    hazard_level: number | null;
    grade_name: string | null;
    grade_point: number | null;
    team_golden_eggs: number | null;
    job_kind: string | null;
}

const EMPTY_REVIEW: Omit<SalmonSessionReview, 'session' | 'totals'> = {
    jobs: [],
    detailedJobs: 0,
    powerEggs: 0,
    rescues: 0,
    goldenAssists: 0,
    jobPoints: 0,
    maxHazardLevel: null,
    scales: {bronze: 0, silver: 0, gold: 0},
    firstGrade: null,
    lastGrade: null,
    waveFailures: Array.from({length: MAX_WAVE}, () => 0),
    kings: {appeared: 0, defeated: 0},
    bosses: [],
    bestJobId: null,
    teamHighScores: [],
    weapons: [],
    newWeapons: [],
    challenges: null,
    clips: 0,
};

// 詳細を取り込んだバイト（キケン度が読めなかったバイトも、WAVE・プレイヤーの行があれば数える）
const DETAILED = `(j.hazard_level IS NOT NULL
    OR EXISTS (SELECT 1 FROM salmon_job_waves w WHERE w.job_id = j.id)
    OR EXISTS (SELECT 1 FROM salmon_job_players p WHERE p.job_id = j.id))`;

const toGrade = (row: ReviewJobRow | undefined): SalmonGrade | null =>
    row && row.grade_name !== null && row.grade_point !== null ? {name: row.grade_name, point: row.grade_point} : null;

/** セッションの終わり（次のセッションの開始。今のセッションなら無し） */
function sessionEnd(session: SalmonSession): number {
    const next = getDb().prepare('SELECT started_at FROM salmon_sessions WHERE id > ? ORDER BY id LIMIT 1').get(session.id) as {started_at: number} | undefined;
    return next?.started_at ?? Number.MAX_SAFE_INTEGER;
}

/** 振り返り。sessionId を省略すると今のセッション。セッションが無ければ session: null */
export function getSessionReview(sessionId?: number): SalmonSessionReview | null {
    const session = sessionId === undefined ? getCurrentSession() : getSession(sessionId);
    if (sessionId !== undefined && !session) return null;
    const summary = getSummary(session?.id);
    const {totals} = summary;
    if (!session) return {session: null, totals, ...EMPTY_REVIEW};

    const db = getDb();
    const rows = db.prepare(`
        SELECT id, golden_eggs, boss_kills, deaths, cleared, wave_reached, stage, hazard_level, grade_name, grade_point, team_golden_eggs, job_kind
        FROM salmon_jobs WHERE session_id = ? ORDER BY id`).all(session.id) as unknown as ReviewJobRow[];
    const jobs = rows.map((row) => ({
        id: row.id,
        goldenEggs: row.golden_eggs,
        bossKills: row.boss_kills,
        deaths: row.deaths,
        cleared: row.cleared === 1,
        waveReached: row.wave_reached,
        stage: row.stage,
        hazardLevel: row.hazard_level,
    }));

    // 詳細（取り込んだバイトだけにある列・子テーブル）の集計
    const detail = db.prepare(`
        SELECT COUNT(*) AS detailedJobs,
               COALESCE(SUM(job_point), 0) AS jobPoints,
               MAX(hazard_level) AS maxHazardLevel,
               COALESCE(SUM(scale_bronze), 0) AS bronze,
               COALESCE(SUM(scale_silver), 0) AS silver,
               COALESCE(SUM(scale_gold), 0) AS gold,
               COALESCE(SUM(king_name IS NOT NULL), 0) AS kingsAppeared,
               COALESCE(SUM(king_defeated = 1), 0) AS kingsDefeated
        FROM salmon_jobs j WHERE session_id = ? AND ${DETAILED}`).get(session.id) as Record<string, number | null>;
    const self = db.prepare(`
        SELECT COALESCE(SUM(p.power_eggs), 0) AS powerEggs, COALESCE(SUM(p.rescues), 0) AS rescues, COALESCE(SUM(p.golden_assists), 0) AS goldenAssists
        FROM salmon_job_players p JOIN salmon_jobs j ON j.id = p.job_id
        WHERE j.session_id = ? AND p.position = 0`).get(session.id) as Record<string, number>;
    const bosses = (db.prepare(`
        SELECT b.boss, SUM(b.self_kills) AS selfKills, SUM(b.team_kills) AS teamKills, SUM(b.appearances) AS appearances
        FROM salmon_job_bosses b JOIN salmon_jobs j ON j.id = b.job_id
        WHERE j.session_id = ? GROUP BY b.boss`).all(session.id) as unknown as BossCount[])
        .filter((b) => salmonBossOrder(b.boss) >= 0)
        .map((b) => ({boss: b.boss, selfKills: Number(b.selfKills), teamKills: Number(b.teamKills), appearances: Number(b.appearances)}))
        .sort((a, b) => b.selfKills - a.selfKills || salmonBossOrder(a.boss) - salmonBossOrder(b.boss));

    const graded = rows.filter((row) => row.grade_name !== null && row.grade_point !== null);
    // バイトチームコンテストのバイトがあれば WAVE 5 まで並べる
    const waveCount = rows.some((row) => row.job_kind === 'teamContest') ? TEAM_CONTEST_MAX_WAVE : MAX_WAVE;
    const waveFailures = Array.from({length: waveCount}, (_, i) => jobs.filter((j) => !j.cleared && j.waveReached === i + 1).length);
    const best = jobs.reduce<(typeof jobs)[number] | null>((top, job) => (top === null || job.goldenEggs > top.goldenEggs ? job : top), null);

    // 同じ納品数なら先に遊んだバイトを上にする
    const teamHighScores = rows
        .map((row, i) => ({row, jobNumber: i + 1}))
        .filter(({row}) => row.team_golden_eggs !== null)
        .sort((a, b) => (b.row.team_golden_eggs as number) - (a.row.team_golden_eggs as number) || a.jobNumber - b.jobNumber)
        .slice(0, REVIEW_HIGH_SCORE_LIMIT)
        .map(({row, jobNumber}) => ({
            jobId: row.id,
            jobNumber,
            teamGoldenEggs: row.team_golden_eggs as number,
            hazardLevel: row.hazard_level,
            cleared: row.cleared === 1,
        }));

    const counts = new Map<string, number>();
    for (const job of summary.jobs) {
        for (const key of job.weapons) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const weapons = [...counts].map(([key, count]) => ({key, count}))
        .sort((a, b) => b.count - a.count)
        .slice(0, REVIEW_WEAPON_LIMIT);

    const end = sessionEnd(session);
    const during = (at: number) => at >= session.startedAt && at < end;
    const newWeapons = getWeaponCard().obtained.filter((w) => during(w.at)).map((w) => w.key);
    const clips = (db.prepare("SELECT COUNT(*) AS n FROM twitch_clips WHERE status = 'created' AND requested_at >= ? AND requested_at < ?")
        .get(session.startedAt, end) as {n: number}).n;

    // お題は今の設定にしか無いので、今のセッションのときだけ出す
    const isCurrent = getCurrentSession()?.id === session.id;
    const settings = isCurrent ? parseSidePanelSettings(getAppState(SIDE_PANEL_STATE_KEY)) : null;
    const challenges = settings && typeof settings !== 'string' && settings.challenges.length > 0
        ? {done: settings.challenges.filter((c) => c.done).length, total: settings.challenges.length}
        : null;

    return {
        session,
        totals,
        jobs,
        detailedJobs: Number(detail.detailedJobs),
        powerEggs: Number(self.powerEggs),
        rescues: Number(self.rescues),
        goldenAssists: Number(self.goldenAssists),
        jobPoints: Number(detail.jobPoints),
        maxHazardLevel: detail.maxHazardLevel === null ? null : Number(detail.maxHazardLevel),
        scales: {bronze: Number(detail.bronze), silver: Number(detail.silver), gold: Number(detail.gold)},
        firstGrade: toGrade(graded[0]),
        lastGrade: toGrade(graded[graded.length - 1]),
        waveFailures,
        kings: {appeared: Number(detail.kingsAppeared), defeated: Number(detail.kingsDefeated)},
        bosses,
        bestJobId: best && best.goldenEggs > 0 ? best.id : null,
        teamHighScores,
        weapons,
        newWeapons,
        challenges,
        clips: Number(clips),
    };
}
