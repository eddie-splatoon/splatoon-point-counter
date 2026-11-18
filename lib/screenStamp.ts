// 画面スタンプの状態（サーバー専用。node:sqlite に依存する）。
// 設定と配信ごとの集計は SQLite の app_state、いま出ているスタンプと間隔の判定・数えるための user_id はメモリだけに持つ。
// ルートごとにモジュールが別に読み込まれても共有できるよう globalThis に置く
import {getAppState, setAppState} from './db';
import {
    matchScreenStamp,
    parseStoredScreenStampSettings,
    SCREEN_STAMP_GLOBAL_INTERVAL_MS,
    SCREEN_STAMP_SAME_INTERVAL_MS,
    SCREEN_STAMP_STATS_DAYS,
    SCREEN_STAMP_WINDOW_GAP_MS,
    ScreenStampChatResult,
    ScreenStampData,
    ScreenStampSettings,
    ScreenStampShown,
    ScreenStampWindowStats,
} from './screenStampTypes';

export const SCREEN_STAMP_STATE_KEY = 'screenStamp';
export const SCREEN_STAMP_STATS_STATE_KEY = 'screenStampStats';
const DAY_MS = 24 * 60 * 60_000;

interface ScreenStampStore {
    current: ScreenStampShown | null;
    lastShownAt: Map<string, number>;
    lastAnyAt: number;
    /** 今の配信の枠を始めた時刻（最初にスタンプを出したとき）。無ければ null */
    windowStartedAt: number | null;
    /** 今の配信の枠で出した人（スタンプの id ごと。人数を数えるだけでディスクには書かない） */
    users: Map<string, Set<string>>;
}
const globalStore = globalThis as typeof globalThis & {__screenStamp?: ScreenStampStore};
const emptyStore = (): ScreenStampStore => ({current: null, lastShownAt: new Map(), lastAnyAt: -Infinity, windowStartedAt: null, users: new Map()});
const store = (): ScreenStampStore => (globalStore.__screenStamp ??= emptyStore());

/**
 * **FOR TESTING PURPOSES ONLY**
 * Resets the in-memory screen stamp state.
 */
export function __TEST_ONLY_resetScreenStamp() {
    globalStore.__screenStamp = emptyStore();
}

export const loadScreenStampSettings = (): ScreenStampSettings =>
    parseStoredScreenStampSettings(getAppState(SCREEN_STAMP_STATE_KEY));

export function saveScreenStampSettings(settings: ScreenStampSettings): void {
    setAppState(SCREEN_STAMP_STATE_KEY, settings);
}

export function getScreenStampData(now = Date.now()): ScreenStampData {
    return {current: store().current, serverTime: now};
}

/** 保存値の 1 枠を読む（形の違うものは null）。開いたままでも SCREEN_STAMP_WINDOW_GAP_MS スタンプが出ていなければ、最後に出した時刻で閉じる */
function parseWindow(w: unknown, now: number): ScreenStampWindowStats | null {
    if (typeof w !== 'object' || w === null) return null;
    const {startedAt, endedAt, lastShownAt, stamps} = w as Record<string, unknown>;
    if (typeof startedAt !== 'number' || (endedAt !== null && typeof endedAt !== 'number') || !Array.isArray(stamps)) return null;
    if (!stamps.every((s) => typeof s === 'object' && s !== null
        && typeof s.id === 'string' && typeof s.label === 'string' && typeof s.shown === 'number' && typeof s.users === 'number')) return null;
    // lastShownAt は後から足した項目なので、無ければ始めた時刻
    const last = typeof lastShownAt === 'number' ? lastShownAt : startedAt;
    const closedAt = endedAt === null && now - last >= SCREEN_STAMP_WINDOW_GAP_MS ? last : endedAt;
    return {startedAt, endedAt: closedAt, lastShownAt: last, stamps};
}

/** 保存済みの集計（形の違うもの・期間を過ぎたものは捨てる） */
function loadStats(now: number): ScreenStampWindowStats[] {
    const stored = getAppState(SCREEN_STAMP_STATS_STATE_KEY);
    if (!Array.isArray(stored)) return [];
    return stored.map((w) => parseWindow(w, now)).filter((w): w is ScreenStampWindowStats => w !== null)
        .filter((w) => (w.endedAt ?? now) >= now - SCREEN_STAMP_STATS_DAYS * DAY_MS);
}

/** 直近 SCREEN_STAMP_STATS_DAYS 日の配信ごとの集計（新しい順） */
export function getScreenStampStats(now = Date.now()): ScreenStampWindowStats[] {
    return loadStats(now).sort((a, b) => b.startedAt - a.startedAt);
}

/** 出したスタンプを今の配信の枠に数えて保存する（保存に失敗してもスタンプは出す） */
function countShown(stampId: string, label: string, userId: string, now: number): void {
    const s = store();
    const stats = loadStats(now);
    // サーバーを再起動したあとも、閉じていない枠があればそこに数え続ける（人数は再起動の後に出した人だけ数え直す）
    let window = stats.find((w) => w.endedAt === null && (s.windowStartedAt === null || w.startedAt === s.windowStartedAt));
    if (!window) {
        window = {startedAt: now, endedAt: null, lastShownAt: now, stamps: []};
        stats.push(window);
    }
    // 新しい枠になったら、人数は数え直す
    if (s.windowStartedAt !== window.startedAt) s.users = new Map();
    s.windowStartedAt = window.startedAt;
    window.lastShownAt = now;
    const users = s.users.get(stampId) ?? new Set<string>();
    users.add(userId);
    s.users.set(stampId, users);
    const entry = window.stamps.find((e) => e.id === stampId);
    if (entry) {
        entry.shown += 1;
        entry.label = label;
        entry.users = Math.max(entry.users, users.size);
    } else {
        window.stamps.push({id: stampId, label, shown: 1, users: users.size});
    }
    try {
        setAppState(SCREEN_STAMP_STATS_STATE_KEY, stats);
    } catch (error) {
        console.error('Failed to save the screen stamp stats:', error);
    }
}

/**
 * チャットのメッセージ（Twitch 連携スクリプトから。text はスタンプを除いた文字、emotes はフォロワースタンプなどの名前）。
 * 設定のフォロワースタンプを含むか、メッセージ全体が辞書の言葉なら出す。
 * 同じスタンプは SCREEN_STAMP_SAME_INTERVAL_MS、どのスタンプも SCREEN_STAMP_GLOBAL_INTERVAL_MS は出さない（制限中のものは捨てる）
 */
export function receiveChat(userId: string, text: string, emotes: string[] = [], now = Date.now()): {result: ScreenStampChatResult; stampId: string | null} {
    const settings = loadScreenStampSettings();
    if (!settings.enabled) return {result: 'disabled', stampId: null};
    const stamp = matchScreenStamp(text, settings.stamps, emotes);
    if (!stamp) return {result: 'none', stampId: null};
    const s = store();
    const last = s.lastShownAt.get(stamp.id);
    if (now - s.lastAnyAt < SCREEN_STAMP_GLOBAL_INTERVAL_MS || (last !== undefined && now - last < SCREEN_STAMP_SAME_INTERVAL_MS)) {
        return {result: 'throttled', stampId: stamp.id};
    }
    s.lastAnyAt = now;
    s.lastShownAt.set(stamp.id, now);
    s.current = {id: (s.current?.id ?? 0) + 1, stampId: stamp.id, label: stamp.label, imageUrl: stamp.imageUrl, timestamp: now};
    countShown(stamp.id, stamp.label, userId, now);
    return {result: 'shown', stampId: stamp.id};
}

/** 配信の終了。今の配信の枠を閉じる（次に出したスタンプから新しい枠にする） */
export function endScreenStampWindow(now = Date.now()): void {
    const s = store();
    s.windowStartedAt = null;
    s.users = new Map();
    const stats = loadStats(now);
    if (!stats.some((w) => w.endedAt === null)) return;
    try {
        setAppState(SCREEN_STAMP_STATS_STATE_KEY, stats.map((w) => (w.endedAt === null ? {...w, endedAt: now} : w)));
    } catch (error) {
        console.error('Failed to save the screen stamp stats:', error);
    }
}
