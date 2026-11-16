// 視聴者参加型の受付の列（サーバー専用）。列はメモリだけに持ち、受付終了で消す（ディスクに書かない）。
// ルートごとにモジュールが別に読み込まれても同じ列を共有できるよう globalThis に置く（lib/telop.ts と同じ）
import {getDb} from './db';
import {
    JOIN_TIER_NAMES,

    JOIN_QUEUE_MAX_ENTRIES,
    JoinCommandResult,
    JoinQueueEntryView,
    JoinQueuePanelView,
    JoinQueuePublicView,
    JoinRating,
    RatedPerson,
    StreamerRating,
    estimateRoomHazard,
    formatCancelReply,
    formatFullReply,
    formatJoinReply,
    parseJoinRating,
    recommendHazards,
    roundHazard,
    sanitizeDisplayName,
} from './joinQueueTypes';
import {pickCurrentSchedule} from './salmonSchedule';
import {getSalmonSchedule} from './salmonScheduleFetch';
import {parsePlayedAt} from './scoreDisplay';

interface JoinQueueEntry {
    userId: string;
    userName: string;
    // 参加したメッセージ（メッセージが削除されたら列から外すのに使う。対応は #119）
    messageId: string;
    rating: JoinRating | null;
    unreadable: boolean;
    joinedAt: number;
    ratedAt: number;
}

interface JoinQueueState {
    // 受付中か（参加型の時間以外の「!参加」は受け付けない）
    open: boolean;
    entries: JoinQueueEntry[];
    // 「次の人」で呼んだ人
    current: JoinQueueEntry | null;
    // 手元で入力した配信者の評価（取り込んだ記録より優先する。受付終了でも消さない）
    streamerOverride: {rating: JoinRating; ratedAt: number} | null;
    revision: number;
}

const initialState = (): JoinQueueState => ({open: false, entries: [], current: null, streamerOverride: null, revision: 0});
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
    // 「!参加」の直後に空白を入れずに続けて書いた（「!参加したい」など）
    attached?: boolean;
}

/** 「!参加」。1 人 1 枠で、書き直したら評価を上書きする（順番はそのまま）。受付中でなければ何もしない（返信もしない） */
export function joinQueue(request: JoinRequest, now = Date.now()): JoinCommandResult {
    const s = state();
    if (!s.open) return {result: 'closed', position: null, reply: null};
    const userName = sanitizeDisplayName(request.userName) || request.userId;
    const {rating, unreadable} = parseJoinRating(request.args);
    // 「!参加したい」「!参加者募集？」のように続けて書いて評価として読めないものは、雑談とみなして受け付けない
    if (request.attached && unreadable) return {result: 'ignored', position: null, reply: null};
    const index = s.entries.findIndex((e) => e.userId === request.userId);
    if (index < 0 && s.entries.length >= JOIN_QUEUE_MAX_ENTRIES) {
        return {result: 'full', position: null, reply: formatFullReply(userName)};
    }
    const entry: JoinQueueEntry = {userId: request.userId, userName, messageId: request.messageId, rating, unreadable, joinedAt: now, ratedAt: now};
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

/** 手元で配信者の評価を入れる（null なら取り込んだ記録に戻す）。読めなければ false */
export function setStreamerRating(args: string | null, now = Date.now()): boolean {
    const s = state();
    if (args === null) {
        s.streamerOverride = null;
    } else {
        const {rating} = parseJoinRating(args);
        if (!rating) return false;
        s.streamerOverride = {rating, ratedAt: now};
    }
    changed();
    return true;
}

/** 取り込んだ最新の記録の評価（いつものバイトだけに出る）。無い・読めなければ null */
export function getRecordedStreamerRating(): RatedPerson & {rating: JoinRating} | null {
    const row = getDb().prepare(`
        SELECT grade_name, grade_point, played_at FROM salmon_jobs
        WHERE grade_name IS NOT NULL ORDER BY id DESC LIMIT 1`)
        .get() as {grade_name: string; grade_point: number | null; played_at: string | null} | undefined;
    const tier = row ? (JOIN_TIER_NAMES as readonly string[]).indexOf(row.grade_name) : -1;
    if (!row || tier < 0) return null;
    return {rating: {tier, points: row.grade_point, note: null}, ratedAt: row.played_at === null ? null : parsePlayedAt(row.played_at)};
}

/** 推定キケン度の計算に使う、列の外の情報（配信者の評価の記録・いまのシフトの開始） */
export interface HazardContext {
    recordedStreamer: (RatedPerson & {rating: JoinRating}) | null;
    shiftStart: number | null;
}

/** 記録とスケジュールから HazardContext を作る。スケジュールが取れなければシフトの区切りはわからない（古い扱いにしない） */
export async function loadHazardContext(now = Date.now()): Promise<HazardContext> {
    const schedule = await getSalmonSchedule();
    // 評価が戻るのはいつものバイトのシフトの区切り
    const shift = schedule ? pickCurrentSchedule(schedule.entries.filter((e) => e.kind === 'regular'), now) : null;
    return {recordedStreamer: getRecordedStreamerRating(), shiftStart: shift?.startTime ?? null};
}

const NO_CONTEXT: HazardContext = {recordedStreamer: null, shiftStart: null};

function streamerOf(context: HazardContext): StreamerRating | null {
    const override = state().streamerOverride;
    if (override) return {...override, source: 'manual'};
    return context.recordedStreamer ? {...context.recordedStreamer, source: 'record'} : null;
}

// 部屋に入る順: いまの人、列の先頭から
const roomOf = (s: JoinQueueState, context: HazardContext) => {
    const participants = [...(s.current ? [s.current] : []), ...s.entries];
    return estimateRoomHazard(streamerOf(context), participants, context.shiftStart);
};

export function getPublicView(context: HazardContext = NO_CONTEXT): JoinQueuePublicView {
    const s = state();
    const room = roomOf(s, context);
    return {
        open: s.open,
        current: s.current?.userName ?? null,
        entries: s.entries.map((e, i) => ({position: i + 1, userName: e.userName})),
        hazard: room.estimate === null ? null : {value: roundHazard(room.estimate, 10), unknown: room.unknown, wild: room.wild},
        revision: s.revision,
    };
}

// messageId は手元にも出さない
const toPanelEntry = (e: JoinQueueEntry) => ({
    userId: e.userId, userName: e.userName, rating: e.rating, unreadable: e.unreadable, joinedAt: e.joinedAt, ratedAt: e.ratedAt,
});

export function getPanelView(context: HazardContext = NO_CONTEXT): JoinQueuePanelView {
    const s = state();
    const room = roomOf(s, context);
    return {
        open: s.open,
        current: s.current ? toPanelEntry(s.current) : null,
        entries: s.entries.map((e, i): JoinQueueEntryView => ({position: i + 1, ...toPanelEntry(e)})),
        streamer: streamerOf(context),
        room,
        shiftStart: context.shiftStart,
        recommended: recommendHazards(room),
        revision: s.revision,
    };
}
