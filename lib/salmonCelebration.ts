// リザルトの取り込みで、本日（セッション内）の最高記録・良い戦績が出たかを判定し、お祝いのテロップ・コメントの文を作る（サーバー専用。node:sqlite に依存する）
import {getDb} from './db';

// これ未満の記録は、セッション内の最高でも祝うほどではないので出さない
export const MIN_SELF_GOLDEN_EGGS = 35;
export const MIN_SELF_BOSS_KILLS = 25;
export const MIN_TEAM_GOLDEN_EGGS = 135;

export type SalmonAchievementKind = 'selfGoldenEggs' | 'selfBossKills' | 'teamGoldenEggs' | 'allBosses';

export interface SalmonAchievement {
    kind: SalmonAchievementKind;
    value: number | null; // 記録の値（allBosses は null）
}

/**
 * 記録したバイト（jobId）の戦績のうち、お祝いするもの。
 * 自分の金イクラ・オオモノ討伐数・チームの金イクラは、同じセッションのそれより前のバイトの最大を超え、しきい値以上のとき
 * （前のバイトにその値が無ければ判定しない。セッションの最初のバイトは当然すべて更新になるため。同数は更新にしない）。
 * チームの金イクラは取り込んだバイトだけが持つ。出現したオオモノをチームで全て倒したら allBosses（記録ではないので最初のバイトでも出す）
 */
export function detectAchievements(jobId: number): SalmonAchievement[] {
    const db = getDb();
    const job = db.prepare('SELECT session_id, golden_eggs, boss_kills, team_golden_eggs FROM salmon_jobs WHERE id = ?').get(jobId) as
        {session_id: number; golden_eggs: number; boss_kills: number; team_golden_eggs: number | null} | undefined;
    if (!job) return [];
    // MAX は対象の行が無ければ NULL（手入力のバイトはチームの金イクラが NULL）
    const previous = db.prepare(`
        SELECT MAX(golden_eggs) AS goldenEggs, MAX(boss_kills) AS bossKills, MAX(team_golden_eggs) AS teamGoldenEggs
        FROM salmon_jobs WHERE session_id = ? AND id < ?`).get(job.session_id, jobId) as
        {goldenEggs: number | null; bossKills: number | null; teamGoldenEggs: number | null};

    const achievements: SalmonAchievement[] = [];
    const isRecord = (value: number | null, best: number | null, min: number): value is number =>
        value !== null && best !== null && value > best && value >= min;
    if (isRecord(job.golden_eggs, previous.goldenEggs, MIN_SELF_GOLDEN_EGGS)) achievements.push({kind: 'selfGoldenEggs', value: job.golden_eggs});
    if (isRecord(job.boss_kills, previous.bossKills, MIN_SELF_BOSS_KILLS)) achievements.push({kind: 'selfBossKills', value: job.boss_kills});
    if (isRecord(job.team_golden_eggs, previous.teamGoldenEggs, MIN_TEAM_GOLDEN_EGGS)) achievements.push({kind: 'teamGoldenEggs', value: job.team_golden_eggs});

    const bosses = db.prepare('SELECT appearances, team_kills AS teamKills FROM salmon_job_bosses WHERE job_id = ?').all(jobId) as
        {appearances: number; teamKills: number}[];
    if (bosses.some((b) => b.appearances > 0) && bosses.every((b) => b.teamKills >= b.appearances)) {
        achievements.push({kind: 'allBosses', value: null});
    }
    return achievements;
}

// 記録 1 つだけのときの文と、まとめるときの部分（「本日の〇〇を更新しました！」の〇〇）、テロップの 2 行目の部分
const RECORD_TEXTS: Record<Exclude<SalmonAchievementKind, 'allBosses'>, {sentence: (v: number) => string; part: (v: number) => string; telop: (v: number) => string}> = {
    selfGoldenEggs: {sentence: (v) => `本日の最高納品数を更新しました！${v}個`, part: (v) => `最高納品数${v}個`, telop: (v) => `金イクラ ${v}個`},
    selfBossKills: {sentence: (v) => `本日の最高討伐数を更新しました！${v}体`, part: (v) => `最高討伐数${v}体`, telop: (v) => `オオモノ ${v}体`},
    teamGoldenEggs: {sentence: (v) => `本日のハイスコアを更新しました！${v}個`, part: (v) => `ハイスコア${v}個`, telop: (v) => `ハイスコア ${v}個`},
};
const ALL_BOSSES_SENTENCE = '先程のバイトは全てのオオモノを処理しました！';
const ALL_BOSSES_FOLLOW_UP = 'さらに全てのオオモノを処理しました！';

/**
 * お祝いの文。telop は配信画面に出す短い 2 行（改行区切り）、message はコメント・読み上げ用の文（複数の戦績は 1 つにまとめる）。
 * 何も無ければ null
 */
export function formatCelebration(achievements: SalmonAchievement[]): {telop: string; message: string} | null {
    const records = achievements.flatMap((a) => (a.kind === 'allBosses' || a.value === null ? [] : [{...RECORD_TEXTS[a.kind], value: a.value}]));
    const allBosses = achievements.some((a) => a.kind === 'allBosses');
    if (records.length === 0) {
        return allBosses ? {telop: '🎉 オオモノ全処理！', message: ALL_BOSSES_SENTENCE} : null;
    }
    const message = records.length === 1 && !allBosses
        ? records[0].sentence(records[0].value)
        : `本日の${records.map((r) => r.part(r.value)).join('、')}を更新しました！${allBosses ? ALL_BOSSES_FOLLOW_UP : ''}`;
    const details = [...records.map((r) => r.telop(r.value)), ...(allBosses ? ['全処理'] : [])].join(' / ');
    return {telop: `🎉 本日の最高記録を更新！\n${details}`, message};
}
