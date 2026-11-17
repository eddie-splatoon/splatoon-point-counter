// 休憩の状態（サーバー専用。読み上げキューを使うので node:sqlite に依存する）。
// テロップと同じくインメモリで持つ（再起動したら休憩は解除されてよい）。ルートごとにモジュールが別に読み込まれても共有できるよう globalThis に置く
import {
    BREAK_REMINDER_COOLDOWN_MS,
    BREAK_REMINDER_TEXT,
    BREAK_VOICE_GRACE_MS,
    BreakState,
} from './breakTypes';
import {enqueueSpeech} from './speech';

interface BreakStore {
    startedAt: number | null;
    voiceHeardAt: number | null;
    lastReminderAt: number | null;
}
const globalStore = globalThis as typeof globalThis & {__breakState?: BreakStore};
const emptyStore = (): BreakStore => ({startedAt: null, voiceHeardAt: null, lastReminderAt: null});
const store = (): BreakStore => (globalStore.__breakState ??= emptyStore());

/**
 * **FOR TESTING PURPOSES ONLY**
 * Resets the in-memory break state.
 */
export function __TEST_ONLY_resetBreak() {
    globalStore.__breakState = emptyStore();
}

export function getBreakState(now = Date.now()): BreakState {
    const s = store();
    return {active: s.startedAt !== null, startedAt: s.startedAt, voiceHeardAt: s.voiceHeardAt, serverTime: now};
}

/** 休憩を始める。休憩中ならそのまま（押し直しで経過時間を戻さない） */
export function startBreak(now = Date.now()): BreakState {
    const s = store();
    if (s.startedAt === null) globalStore.__breakState = {...emptyStore(), startedAt: now};
    return getBreakState(now);
}

export function endBreak(now = Date.now()): BreakState {
    globalStore.__breakState = emptyStore();
    return getBreakState(now);
}

export type HeardResult = 'idle' | 'ended' | 'grace' | 'reminded' | 'noted';

/**
 * 休憩中に配信者の声を拾ったとき（文字起こしスクリプトから）。resume（「ただいま」などの合言葉）なら休憩を終わる。
 * そうでなければ、開始から BREAK_VOICE_GRACE_MS を過ぎていれば解除忘れとして記録し、読み上げで知らせる（BREAK_REMINDER_COOLDOWN_MS は読み直さない）
 */
export function heardVoice(resume: boolean, now = Date.now()): {result: HeardResult; state: BreakState} {
    const s = store();
    if (s.startedAt === null) return {result: 'idle', state: getBreakState(now)};
    if (resume) return {result: 'ended', state: endBreak(now)};
    if (now - s.startedAt < BREAK_VOICE_GRACE_MS) return {result: 'grace', state: getBreakState(now)};
    s.voiceHeardAt = now;
    if (s.lastReminderAt !== null && now - s.lastReminderAt < BREAK_REMINDER_COOLDOWN_MS) {
        return {result: 'noted', state: getBreakState(now)};
    }
    s.lastReminderAt = now;
    enqueueSpeech(BREAK_REMINDER_TEXT);
    return {result: 'reminded', state: getBreakState(now)};
}
