// スコア表示（/obs-overlay の scoreLabel / scoreValue）の保存と、リザルトの取り込みからの自動更新。サーバー専用（node:sqlite に依存する）。
// コントロールパネルの StreamData の保存（POST /api/stream-data）とは別に持ち、取り込みで入れた値をパネルの保存で上書きしない

import {getAppState, getDb, setAppState} from './db';
import {SalmonScheduleData, SalmonScheduleEntry} from './salmonSchedule';
import {getSalmonSchedule} from './salmonScheduleFetch';
import {SalmonJobDetails, SalmonJobKind} from './salmonTypes';
import {
    GRADE_SCORE_LABEL,
    HIGH_SCORE_LABEL,
    ScoreDisplay,
    ScoreDisplaySettings,
    formatGrade,
    parseStoredScoreDisplay,
} from './scoreDisplayTypes';

export const SCORE_DISPLAY_STATE_KEY = 'scoreDisplay';

export function getScoreDisplay(): ScoreDisplaySettings {
    return parseStoredScoreDisplay(getAppState(SCORE_DISPLAY_STATE_KEY));
}

/** 送られた項目（undefined 以外）だけを書き換えて保存する */
export function updateScoreDisplay(update: Partial<ScoreDisplaySettings>): ScoreDisplaySettings {
    const defined = Object.fromEntries(Object.entries(update).filter(([, value]) => value !== undefined));
    const next = {...getScoreDisplay(), ...defined};
    setAppState(SCORE_DISPLAY_STATE_KEY, next);
    return next;
}

const PLAYED_AT_PATTERN = /^(\d{4})\/(\d{1,2})\/(\d{1,2}) (\d{1,2}):(\d{2})$/;
// イカリング3は日本時間で表示する
const JST_OFFSET_MS = 9 * 60 * 60_000;

/** イカリング3に表示されたバイトの日時（「2026/11/9 21:18」、日本時間）をエポックミリ秒にする。形が違えば null */
export function parsePlayedAt(playedAt: string): number | null {
    const match = PLAYED_AT_PATTERN.exec(playedAt);
    if (!match) return null;
    const [year, month, day, hour, minute] = match.slice(1).map(Number);
    return Date.UTC(year, month - 1, day, hour, minute) - JST_OFFSET_MS;
}

/**
 * シフト（スケジュールの 1 枠）の中で記録したバイトの、チームの金イクラ納品数の最大。無ければ null。
 * バイトチームコンテストはクリアしたバイトだけ（ゲーム内のハイスコアと同じ）、ビッグランは失敗したバイトも数える
 */
export function getShiftHighScore(kind: SalmonJobKind, shift: Pick<SalmonScheduleEntry, 'startTime' | 'endTime'>): number | null {
    const rows = getDb().prepare(`
        SELECT played_at, team_golden_eggs FROM salmon_jobs
        WHERE job_kind = ? AND played_at IS NOT NULL AND team_golden_eggs IS NOT NULL ${kind === 'teamContest' ? 'AND cleared = 1' : ''}`)
        .all(kind) as {played_at: string; team_golden_eggs: number}[];
    const scores = rows
        .filter((row) => {
            const time = parsePlayedAt(row.played_at);
            return time !== null && shift.startTime <= time && time < shift.endTime;
        })
        .map((row) => row.team_golden_eggs);
    return scores.length === 0 ? null : Math.max(...scores);
}

/** 取り込んだバイト（記録済み）から、スコア表示に入れる値を決める。決められなければ null（今の表示を変えない） */
export function computeScoreDisplay(
    job: {jobKind: SalmonJobKind | null; playedAt: string; details: SalmonJobDetails | null},
    schedule: SalmonScheduleData | null,
): ScoreDisplay | null {
    if (job.jobKind === 'regular') {
        const grade = formatGrade(job.details?.gradeName ?? null, job.details?.gradePoint ?? null);
        return grade === null ? null : {scoreLabel: GRADE_SCORE_LABEL, scoreValue: grade};
    }
    if (job.jobKind === null || !schedule) return null;
    const time = parsePlayedAt(job.playedAt);
    const shift = time === null ? undefined : schedule.entries.find((e) => e.kind === job.jobKind && e.startTime <= time && time < e.endTime);
    if (!shift) return null;
    const highScore = getShiftHighScore(job.jobKind, shift);
    return highScore === null ? null : {scoreLabel: HIGH_SCORE_LABEL, scoreValue: String(highScore)};
}

/**
 * リザルトの取り込みで記録したあとに呼ぶ。最新のバイト（jobs の最後）に合わせてスコア表示を書き換える。
 * 自動更新が OFF・値を決められないときは何もせず null。スケジュールはビッグラン・バイトチームコンテストのシフトの区切りにだけ使う
 */
export async function updateScoreDisplayFromImport(
    jobs: {job: {jobKind: SalmonJobKind | null}; playedAt: string; details: SalmonJobDetails | null}[],
    loadSchedule: () => Promise<SalmonScheduleData | null> = getSalmonSchedule,
): Promise<ScoreDisplaySettings | null> {
    const latest = jobs[jobs.length - 1];
    if (!latest || !getScoreDisplay().autoUpdate) return null;
    const {jobKind} = latest.job;
    const schedule = jobKind === 'bigRun' || jobKind === 'teamContest' ? await loadSchedule() : null;
    const display = computeScoreDisplay({jobKind, playedAt: latest.playedAt, details: latest.details}, schedule);
    return display === null ? null : updateScoreDisplay(display);
}
