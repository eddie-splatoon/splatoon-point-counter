// 視聴者参加型の受付の列（サーバー専用）。列はメモリだけに持ち、受付終了で消す（ディスクに書かない）。
// ルートごとにモジュールが別に読み込まれても同じ列を共有できるよう globalThis に置く（lib/telop.ts と同じ）
import {
    JOIN_QUEUE_MAX_ENTRIES,
    JoinCommandResult,
    JoinQueueEntryView,
    JoinQueuePanelView,
    JoinQueuePublicView,
    JoinRating,
    formatCancelReply,
    formatFullReply,
    formatJoinReply,
    parseJoinRating,
    sanitizeDisplayName,
} from './joinQueueTypes';

interface JoinQueueEntry {
    userId: string;
    userName: string;
    // 参加したメッセージ（削除されたら列から外すため）
    messageId: string;
    rating: JoinRating | null;
    unreadable: boolean;
    joinedAt: number;
}

interface JoinQueueState {
    // 受付中か（参加型の時間以外の「!参加」は受け付けない）
    open: boolean;
    entries: JoinQueueEntry[];
    // 「次の人」で呼んだ人
    current: JoinQueueEntry | null;
    revision: number;
}

const initialState = (): JoinQueueState => ({open: false, entries: [], current: null, revision: 0});
const globalStore = globalThis as typeof globalThis & {__joinQueueState?: JoinQueueState};
const state = (): JoinQueueState => (globalStore.__joinQueueState ??= initialState());

/**
 * **FOR TESTING PURPOSES ONLY**
 * Resets the in-memory join queue.
 */
export function __TEST_ONLY_resetJoinQueue() {
    globalStore.__joinQueueState = initialState();
}

const changed = () => {
    state().revision += 1;
};

export interface JoinRequest {
    userId: string;
    userName: string;
    messageId: string;
    args: string;
}

/** 「!参加」。1 人 1 枠で、書き直したら評価を上書きする（順番はそのまま）。受付中でなければ何もしない（返信もしない） */
export function joinQueue(request: JoinRequest, now = Date.now()): JoinCommandResult {
    const s = state();
    if (!s.open) return {result: 'closed', position: null, reply: null};
    const userName = sanitizeDisplayName(request.userName) || request.userId;
    const {rating, unreadable} = parseJoinRating(request.args);
    const index = s.entries.findIndex((e) => e.userId === request.userId);
    if (index < 0 && s.entries.length >= JOIN_QUEUE_MAX_ENTRIES) {
        return {result: 'full', position: null, reply: formatFullReply(userName)};
    }
    const entry: JoinQueueEntry = {userId: request.userId, userName, messageId: request.messageId, rating, unreadable, joinedAt: now};
    if (index < 0) {
        s.entries.push(entry);
    } else {
        s.entries[index] = {...entry, joinedAt: s.entries[index].joinedAt};
    }
    changed();
    const position = (index < 0 ? s.entries.length - 1 : index) + 1;
    return {result: index < 0 ? 'joined' : 'updated', position, reply: formatJoinReply(userName, position, unreadable)};
}

/** 「!取消」。列にいなければ何もしない */
export function cancelJoin(userId: string): JoinCommandResult {
    const s = state();
    const entry = s.entries.find((e) => e.userId === userId);
    if (!entry) return {result: 'notFound', position: null, reply: null};
    s.entries = s.entries.filter((e) => e !== entry);
    changed();
    return {result: 'cancelled', position: null, reply: formatCancelReply(entry.userName)};
}

/** 先頭の人を呼ぶ（列が空ならいまの人を消す） */
export function callNext(): void {
    const s = state();
    s.current = s.entries.shift() ?? null;
    changed();
}

/** 配信者が列（といまの人）から外す */
export function removeFromQueue(userId: string): boolean {
    const s = state();
    const before = s.entries.length;
    s.entries = s.entries.filter((e) => e.userId !== userId);
    const wasCurrent = s.current?.userId === userId;
    if (wasCurrent) s.current = null;
    if (s.entries.length === before && !wasCurrent) return false;
    changed();
    return true;
}

export function openQueue(): void {
    state().open = true;
    changed();
}

/** 受付終了。列といまの人を消す */
export function closeQueue(): void {
    const s = state();
    s.open = false;
    s.entries = [];
    s.current = null;
    changed();
}

export function getPublicView(): JoinQueuePublicView {
    const s = state();
    return {
        open: s.open,
        current: s.current?.userName ?? null,
        entries: s.entries.map((e, i) => ({position: i + 1, userName: e.userName})),
        revision: s.revision,
    };
}

// messageId は手元にも出さない
const toPanelEntry = (e: JoinQueueEntry) => ({userId: e.userId, userName: e.userName, rating: e.rating, unreadable: e.unreadable, joinedAt: e.joinedAt});

export function getPanelView(): JoinQueuePanelView {
    const s = state();
    return {
        open: s.open,
        current: s.current ? toPanelEntry(s.current) : null,
        entries: s.entries.map((e, i): JoinQueueEntryView => ({position: i + 1, ...toPanelEntry(e)})),
        revision: s.revision,
    };
}
