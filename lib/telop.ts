// 実況テロップの状態（いま出ているテロップ・Twitch のチャットへの書き込み待ち）とプリセットの読み込み（サーバー専用。node:sqlite に依存する）。
// /api/telop のほか /api/salmon/import（記録のお祝い）からも出すので、ルートごとにモジュールが別に読み込まれても
// 同じ状態を共有できるよう globalThis に置く（lib/speech.ts の読み上げキューと同じ）
import {getAppState} from './db';
import {enqueueSpeech} from './speech';
import {
    FOLLOW_SPEECH_TEXT,
    FOLLOW_TELOP_COOLDOWN_MS,
    FOLLOW_TELOP_TEXT,
    Telop,
    TelopChatPost,
    TelopData,
    TelopEffect,
    TelopPreset,
    getDefaultTelopSettings,
    parseTelopSettings,
} from './telopTypes';

export const TELOP_STATE_KEY = 'telop';
// Twitch 連携スクリプトが拾わなければ（未起動）、この時間でコメントをあきらめてテロップ側で読み上げる
export const CHAT_PICKUP_TTL_MS = 3000;
// 拾った後に結果が届かなければ、この時間で読み上げずに捨てる（書き込めたかわからないので、二重に読まない）
export const CHAT_RESULT_TTL_MS = 30000;
const MAX_CHAT_POSTS = 20;

// いま出ているテロップはインメモリで持つ（字幕と同じく、再起動したら消えてよい）。プリセットは SQLite に保存する
interface TelopState {
    current: Telop | null;
    revision: number;
    // Twitch のチャットへの書き込み待ち。ID は起動時刻から振る（再起動後に、スクリプトが試した ID と重ならないように）
    chatPosts: TelopChatPost[];
    nextChatId: number;
    // 最後にフォローのお礼を出した時刻（続いたフォローを 1 回にまとめるため）
    lastFollowTelopAt: number | null;
}
const globalStore = globalThis as typeof globalThis & {__telopState?: TelopState};
const state = (): TelopState =>
    (globalStore.__telopState ??= {current: null, revision: 0, chatPosts: [], nextChatId: Date.now(), lastFollowTelopAt: null});

/**
 * **FOR TESTING PURPOSES ONLY**
 * Resets the in-memory telop.
 */
export function __TEST_ONLY_resetTelop() {
    globalStore.__telopState = {current: null, revision: 0, chatPosts: [], nextChatId: 1, lastFollowTelopAt: null};
}

/** 期限を過ぎた書き込み待ちを外し、残りを返す。拾われなかったものは、読み上げる設定ならテロップ側で読み上げる */
export function expireChatPosts(now = Date.now()): TelopChatPost[] {
    const s = state();
    s.chatPosts = s.chatPosts.filter((post) => {
        if (post.picked) return now - post.createdAt < CHAT_RESULT_TTL_MS;
        if (now - post.createdAt < CHAT_PICKUP_TTL_MS) return true;
        if (post.speak) enqueueSpeech(post.text);
        return false;
    });
    return s.chatPosts;
}

/** 保存済みのプリセット。未保存、または不正なら既定値 */
export const loadPresets = (): TelopPreset[] => {
    const saved = parseTelopSettings(getAppState(TELOP_STATE_KEY));
    return (typeof saved === 'string' ? getDefaultTelopSettings() : saved).presets;
};

export const getTelopData = (): TelopData => ({presets: loadPresets(), current: state().current, revision: state().revision, serverTime: Date.now()});

/** テロップを出す（オーバーレイの表示を置き換える） */
export function showTelop(telop: {text: string; followFont: boolean; effect: TelopEffect | null}, now = Date.now()): void {
    const s = state();
    s.revision += 1;
    s.current = {id: s.revision, ...telop, timestamp: now};
}

/**
 * Twitch のチャットへの書き込み待ちに入れる。書き込んだコメントは配信者のコメントとして読み上げられるので、ここでは読まない
 * （二重にならないように）。書き込めなかったときだけ、speak ならテロップ側で読む
 */
export function queueChatPost(text: string, speak: boolean, now = Date.now()): void {
    const s = state();
    expireChatPosts(now);
    s.chatPosts = [...s.chatPosts, {id: s.nextChatId++, text, speak, picked: false, createdAt: now}].slice(-MAX_CHAT_POSTS);
}

/** 書き込み待ちを 1 件外す */
export function removeChatPost(id: number): void {
    const s = state();
    s.chatPosts = s.chatPosts.filter((p) => p.id !== id);
}

/** フォローのお礼を出す。前回から FOLLOW_TELOP_COOLDOWN_MS 以内なら何もしない。チャットには書き込まない */
export function showFollowTelop(now = Date.now()): void {
    const s = state();
    if (s.lastFollowTelopAt !== null && now - s.lastFollowTelopAt < FOLLOW_TELOP_COOLDOWN_MS) return;
    s.lastFollowTelopAt = now;
    showTelop({text: FOLLOW_TELOP_TEXT, followFont: true, effect: 'follow'}, now);
    enqueueSpeech(FOLLOW_SPEECH_TEXT);
}

/**
 * サーモンランの記録のお祝いを出す。telop（画面用の短い文）を演出付きで出し、message（コメント・読み上げ用の文）を
 * チャットに書き込む（書き込めれば配信者のコメントとして読み上げられ、書き込めなければテロップ側で読み上げる）
 */
export function showCelebrationTelop(celebration: {telop: string; message: string}, now = Date.now()): void {
    showTelop({text: celebration.telop, followFont: true, effect: 'record'}, now);
    queueChatPost(celebration.message, true, now);
}
