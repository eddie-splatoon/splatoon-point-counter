// 休憩中の表示の型・定数（クライアントからも使う）

/** 休憩の状態（GET /api/break の応答） */
export interface BreakState {
    active: boolean;
    /** 休憩を始めた時刻（サーバーの時計）。休憩中でなければ null */
    startedAt: number | null;
    /** 休憩中に最後に配信者の声を拾った時刻（解除忘れの注意。開始直後は数えない）。無ければ null */
    voiceHeardAt: number | null;
    /** 応答したときのサーバーの時計（経過時間をブラウザの時計に置き換えるため） */
    serverTime: number;
}

export const BREAK_ACTIONS = ['start', 'end', 'heard'] as const;
export type BreakAction = typeof BREAK_ACTIONS[number];
export const isBreakAction = (value: unknown): value is BreakAction =>
    (BREAK_ACTIONS as readonly unknown[]).includes(value);

/** 休憩を始めてからこの時間は、声を拾っても注意しない（「ちょっと水取ってきます」など、離れる前のひとことで出さない） */
export const BREAK_VOICE_GRACE_MS = 60 * 1000;
/** 声を拾ったときの読み上げの注意を、続けて出さない時間 */
export const BREAK_REMINDER_COOLDOWN_MS = 60 * 1000;
/** 休憩がこの時間を超えたら、コントロールパネルで解除忘れを注意する */
export const BREAK_LONG_MS = 10 * 60 * 1000;
/** 休憩中に声を拾ったときに読み上げる文 */
export const BREAK_REMINDER_TEXT = '休憩中のままです。戻ったら休憩を終わってください。';

/** 経過時間を m:ss（1 時間以上は h:mm:ss）で表す */
export function formatBreakElapsed(ms: number): string {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor(totalSeconds / 60) % 60;
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
}

/** 応答の休憩の状態を、ブラウザの時計での開始時刻に置き換える（OBS・ブラウザとサーバーの時計がずれていてもよいように）。休憩中でなければ null */
export function localBreakStart(state: BreakState | null | undefined, now = Date.now()): number | null {
    if (!state?.active || typeof state.startedAt !== 'number' || typeof state.serverTime !== 'number') return null;
    return now - (state.serverTime - state.startedAt);
}
