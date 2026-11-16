// 視聴者参加型の受付（!参加）の型・評価の読み取り・返信の文面（クライアントからも使う）

// 評価の称号（tier の順）。たつじん+1〜+3 は tier 5〜7、でんせつは 8
export const JOIN_TIER_NAMES = [
    'かけだし', 'はんにんまえ', 'いちにんまえ', 'じゅくれん', 'たつじん', 'たつじん+1', 'たつじん+2', 'たつじん+3', 'でんせつ',
] as const;
export const LEGEND_TIER = 8;
const TATSUJIN_TIER = 4;
// でんせつの評価値の上限（カンスト）
const LEGEND_MAX_POINTS = 999;

// 受付の列の人数の上限
export const JOIN_QUEUE_MAX_ENTRIES = 20;
// 「!参加」の後ろに書ける長さ（これより長いものは読まない）
export const JOIN_ARGS_MAX_LENGTH = 20;
// 配信画面に出す表示名の長さ
const MAX_DISPLAY_NAME_LENGTH = 25;

export const JOIN_HOW_TO = '!参加 でんせつ820 / !参加 たつじん+1（!参加 だけでも OK）';

/** 申告された評価。points が null は称号だけ（評価値なし。キケン度の計算では近似する） */
export interface JoinRating {
    tier: number;
    points: number | null;
    // 手元に出す読み方の注記（「たつじん 3 として読みました」など）
    note: string | null;
}

export interface JoinRatingResult {
    // 評価が書かれていない・読めないときは null（受付は続ける）
    rating: JoinRating | null;
    // 何か書かれていたのに読めなかった（書き方を返す）
    unreadable: boolean;
}

// ゼロ幅文字・方向制御文字（見た目を偽装するのに使われる）
const INVISIBLE_PATTERN = /[​-‏‪-‮⁦-⁩﻿]/g;

/** 前処理: NFKC（全角の英数字・記号・空白を半角に）→ ゼロ幅・方向制御文字の除去 → 小文字・カタカナをひらがな → 空白を 1 つに */
export function normalizeJoinText(text: string): string {
    return text
        .normalize('NFKC')
        .replace(INVISIBLE_PATTERN, '')
        .toLowerCase()
        .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
        .replace(/\s+/g, ' ')
        .trim();
}

// 称号の照合では空白・中点・長音・ハイフンを除く（「Eggsecutive VP」「Part-Timer」など）
const titleKey = (text: string) => normalizeJoinText(text).replace(/[\s・ー\-_]/g, '');

interface TitleAlias {
    tier: number;
    // 評価値が書かれていないときの値（intern は「かけだし 0」）
    defaultPoints?: number;
    // カンスト（でんせつ 999）
    counterStop?: boolean;
}

const ALIASES: [TitleAlias, string[]][] = [
    [{tier: 0}, ['かけだし', '駆け出し', '駆出し', 'kakedashi', 'apprentice']],
    [{tier: 0, defaultPoints: 0}, ['intern']],
    [{tier: 1}, ['はんにんまえ', '半人前', 'hanninmae', 'parttimer']],
    [{tier: 2}, ['いちにんまえ', '一人前', 'ichininmae', 'gogetter']],
    [{tier: 3}, ['じゅくれん', '熟練', 'jukuren', 'overachiever']],
    [{tier: TATSUJIN_TIER}, ['たつじん', '達人', 'tatsujin', 'profreshional', 'profreshionalparttimer', 'pro']],
    [{tier: LEGEND_TIER}, ['でんせつ', '伝説', 'densetsu', 'legend', 'れじぇんど', 'eggsecutivevp', 'eggsecutive', 'evp', 'vp']],
    [{tier: LEGEND_TIER, counterStop: true}, ['かんすと', 'counterstop', 'max']],
];
const TITLE_ALIASES = new Map(ALIASES.flatMap(([alias, words]) => words.map((word) => [titleKey(word), alias] as const)));

// ホワイトリストの文法: 称号? (+N | ぷらすN | plusN)? 評価値?（評価値は空白で区切っても続けてもよい）
// 1: 称号 2: +N の N 3: 評価値
const RATING_PATTERN = /^([^\d+]*?)\s*(?:(?:\+|ぷらす|plus)\s*(\d))?\s*(\d+)?$/u;

const UNREADABLE: JoinRatingResult = {rating: null, unreadable: true};

/** 「!参加」の後ろ（引数）から評価を読む。何も書かれていなければ評価なし、読めなければ unreadable（どちらも受付はする） */
export function parseJoinRating(args: string): JoinRatingResult {
    const text = normalizeJoinText(args);
    if (text === '') return {rating: null, unreadable: false};
    if (Array.from(text).length > JOIN_ARGS_MAX_LENGTH) return UNREADABLE;
    const match = RATING_PATTERN.exec(text);
    if (!match) return UNREADABLE;
    const [, title, plus, pointsText] = match;
    if (pointsText !== undefined && pointsText.length > 3) return UNREADABLE; // 1000 以上は無効
    const points = pointsText === undefined ? null : Number(pointsText);
    const key = titleKey(title);

    if (key === '') {
        // 数字だけ: 100〜999 はでんせつとみなす。0〜99 は称号がわからないので聞き返す
        if (plus !== undefined || points === null || points < 100) return UNREADABLE;
        return {rating: {tier: LEGEND_TIER, points, note: '数字だけなので、でんせつとみなしました'}, unreadable: false};
    }

    const alias = TITLE_ALIASES.get(key);
    if (!alias) return UNREADABLE;
    if (alias.counterStop) {
        if (plus !== undefined || (points !== null && points !== LEGEND_MAX_POINTS)) return UNREADABLE;
        return {rating: {tier: LEGEND_TIER, points: LEGEND_MAX_POINTS, note: null}, unreadable: false};
    }

    let tier = alias.tier;
    if (plus !== undefined) {
        const n = Number(plus);
        if (tier !== TATSUJIN_TIER || n < 1 || n > 3) return UNREADABLE;
        tier += n;
    }
    // たつじん以下の評価値は 0〜99（「たつじん+1 999」は無い）
    const maxPoints = tier === LEGEND_TIER ? LEGEND_MAX_POINTS : 99;
    if (points !== null && points > maxPoints) return UNREADABLE;

    if (points === null && alias.defaultPoints !== undefined) {
        return {rating: {tier, points: alias.defaultPoints, note: `${title.trim()} は ${JOIN_TIER_NAMES[tier]} ${alias.defaultPoints} とみなしました`}, unreadable: false};
    }
    // 「たつじん3」は +3 ではなく評価値 3 として読む（+ のない数字は評価値）
    const note = tier === TATSUJIN_TIER && plus === undefined && points !== null && points >= 1 && points <= 3
        ? `たつじん+${points} ではなく、たつじん ${points} として読みました`
        : null;
    return {rating: {tier, points, note}, unreadable: false};
}

/** 手元に出す評価（「でんせつ 820」、評価値が無ければ「たつじん（評価値なし・近似）」） */
export function formatJoinRating(rating: JoinRating | null): string {
    if (!rating) return '不明';
    const name = JOIN_TIER_NAMES[rating.tier];
    return rating.points === null ? `${name}（評価値なし・近似）` : `${name} ${rating.points}`;
}

/** 表示名を整える（制御文字・書式文字を除き、重ねた結合文字は 2 つまでにして、25 文字まで）。画面には textContent で出す */
export function sanitizeDisplayName(name: string): string {
    const cleaned = name
        .normalize('NFKC')
        .replace(/[\p{Cc}\p{Cf}]/gu, '')
        .replace(/(\p{M}{2})\p{M}+/gu, '$1')
        .replace(/\s+/g, ' ')
        .trim();
    return Array.from(cleaned).slice(0, MAX_DISPLAY_NAME_LENGTH).join('');
}

/** 受付の返信（評価はくり返さない。読めなかったときは書き方を付ける） */
export function formatJoinReply(userName: string, position: number, unreadable: boolean): string {
    const head = `${userName} さん、受付しました（${position} 番目）。`;
    return unreadable ? `${head}書き方: ${JOIN_HOW_TO}` : `${head}評価は気にせず気軽にどうぞ。※ !参加 だけでも OK`;
}

export const formatCancelReply = (userName: string) => `${userName} さん、受付を取り消しました。`;
export const formatFullReply = (userName: string) => `${userName} さん、ごめんなさい。受付がいっぱいです（${JOIN_QUEUE_MAX_ENTRIES} 人まで）。`;

// ---- 部屋の推定キケン度 ----

// 部屋の人数（配信者 + 参加者 3 人）
export const ROOM_SIZE = 4;
// キケン度の上限（MAX）
export const MAX_HAZARD = 333;
// 評価値が無い（称号だけ）ときの近似。たつじん以下は tier の中央、でんせつは仮の値（仕様では要調整）
const APPROX_POINTS = 50;
const APPROX_LEGEND_POINTS = 400;

/**
 * 累計評価値（0〜1799）。tier 0〜7 は tier*100 + 評価値、でんせつは 800 + 評価値。
 * 評価値が無ければ近似する
 */
export function ratingAxis(rating: JoinRating): number {
    if (rating.tier >= LEGEND_TIER) return 800 + (rating.points ?? APPROX_LEGEND_POINTS);
    return rating.tier * 100 + (rating.points ?? APPROX_POINTS);
}

/** 推定キケン度(%) = 累計評価値 ÷ 5、上限 333%（攻略 Wiki の解析値。公式は公表していない） */
export const hazardOfAxis = (axis: number): number => Math.min(MAX_HAZARD, axis / 5);

/** キケン度に相当する評価（230% → でんせつ 350、88% → たつじん 40）。hazardOfAxis の逆 */
export function ratingOfHazard(hazard: number): JoinRating {
    const axis = Math.max(0, Math.round(hazard * 5));
    if (axis >= 800) return {tier: LEGEND_TIER, points: Math.min(LEGEND_MAX_POINTS, axis - 800), note: null};
    return {tier: Math.floor(axis / 100), points: axis % 100, note: null};
}

/** 「230%（でんせつ 350 相当）」 */
export const formatHazardWithRating = (hazard: number): string => `${hazard}%（${formatJoinRating(ratingOfHazard(hazard))} 相当）`;

/** キケン度を step% ごとに丸める（333% は MAX なので丸めない。丸めて 333% を超えるときも 333%） */
export function roundHazard(value: number, step: number): number {
    if (value >= MAX_HAZARD) return MAX_HAZARD;
    return Math.min(MAX_HAZARD, Math.round(value / step) * step);
}

/** 計算に使う人。ratedAt は評価を申告（記録）した時刻（わからなければ null） */
export interface RatedPerson {
    rating: JoinRating | null;
    ratedAt: number | null;
}

export interface RoomHazard {
    // 推定キケン度（丸める前）。評価がわかる人が 1 人もいなければ null
    estimate: number | null;
    // 計算に使った人数（配信者を含む）
    counted: number;
    // 評価が不明で計算から外した人数（配信者を含む）
    unknown: number;
    // 部屋に足りない人数（野良。計算には含まない）
    wild: number;
    // 計算に使った評価のうち、いまのシフトより前に申告したもの（シフトが替わると評価が「称号 40」に戻る）
    stale: number;
    // 計算に使った人のうち、いちばん低い人のキケン度（練習のおすすめ）
    lowest: number | null;
    // 配信者より低い称号の参加者の人数（通常のバイトに合流すると、評価が上がるのはいちばん低い称号の人だけ）
    lowerTier: number;
}

/**
 * 配信者と参加者（先頭から、配信者と合わせて 4 人まで）から部屋の推定キケン度を出す。
 * 評価が不明の人は外し、4 人に足りない分（野良）は含まない。shiftStart はいまのシフトの開始（わからなければ null）
 */
export function estimateRoomHazard(streamer: RatedPerson | null, participants: RatedPerson[], shiftStart: number | null): RoomHazard {
    const members = participants.slice(0, ROOM_SIZE - 1);
    const people = [streamer ?? {rating: null, ratedAt: null}, ...members];
    const known = people.filter((p): p is RatedPerson & {rating: JoinRating} => p.rating !== null);
    const hazards = known.map((p) => hazardOfAxis(ratingAxis(p.rating)));
    const streamerTier = streamer?.rating?.tier;
    return {
        estimate: known.length === 0 ? null : hazardOfAxis(known.reduce((sum, p) => sum + ratingAxis(p.rating), 0) / known.length),
        counted: known.length,
        unknown: people.length - known.length,
        wild: ROOM_SIZE - people.length,
        stale: known.filter((p) => isStaleRating(p.ratedAt, shiftStart)).length,
        lowest: hazards.length === 0 ? null : Math.min(...hazards),
        lowerTier: streamerTier === undefined ? 0 : members.filter((p) => p.rating !== null && p.rating.tier < streamerTier).length,
    };
}

/** 手元に出すおすすめのキケン度（5% ごと）。練習: いちばん低い人、通常: 推定値、腕試し: 333% */
export function recommendHazards(room: RoomHazard): {practice: number; normal: number; challenge: number} | null {
    if (room.estimate === null || room.lowest === null) return null;
    return {practice: roundHazard(room.lowest, 5), normal: roundHazard(room.estimate, 5), challenge: MAX_HAZARD};
}

/** シフトが替わる前に申告した評価か（シフトが替わると評価は「称号 40」に戻る） */
export const isStaleRating = (ratedAt: number | null, shiftStart: number | null): boolean =>
    ratedAt !== null && shiftStart !== null && ratedAt < shiftStart;

/** 配信画面の文面（値は 10% ごとに丸めたもの） */
export function formatRoomHazard(hazard: JoinQueuePublicHazard): string {
    const notes = [
        hazard.unknown > 0 ? `不明 ${hazard.unknown} 人を除く` : null,
        hazard.wild > 0 ? `野良 ${hazard.wild} 人分は含まない` : null,
    ].filter((note) => note !== null);
    const head = `この部屋の推定キケン度 約 ${hazard.value}%（${formatJoinRating(ratingOfHazard(hazard.value))} 相当・自己申告からの目安）`;
    return notes.length === 0 ? head : `${head}。${notes.join('・')}`;
}

// 配信者が流すお知らせ（チャットに書き込んで読み上げる）
export const JOIN_ANNOUNCEMENT_KINDS = ['merge', 'private'] as const;
export type JoinAnnouncementKind = typeof JOIN_ANNOUNCEMENT_KINDS[number];

export function formatJoinAnnouncement(kind: JoinAnnouncementKind, recommended: number | null): string {
    if (kind === 'merge') return 'ここからは通常のバイトに合流します。配信者の評価は気にしなくて大丈夫です。一緒に楽しみましょう';
    const head = 'プライベートバイトの枠です。評価は減らないので、誰でも気軽にどうぞ。';
    return recommended === null ? head : `${head}今日のおすすめは ${recommended}% です`;
}

// ---- API の型 ----

/** 配信画面に出す推定キケン度（10% ごとに丸めた値と人数だけ。誰の評価かは出さない） */
export interface JoinQueuePublicHazard {
    value: number;
    unknown: number;
    wild: number;
}

/** 配信画面用（番号・表示名だけ。評価は出さない） */
export interface JoinQueuePublicView {
    open: boolean;
    current: string | null;
    entries: {position: number; userName: string}[];
    // 部屋の推定キケン度。評価がわかる人がいなければ null
    hazard: JoinQueuePublicHazard | null;
    revision: number;
}

export interface JoinQueueEntryView {
    position: number;
    userId: string;
    userName: string;
    rating: JoinRating | null;
    unreadable: boolean;
    joinedAt: number;
    // 評価を申告した時刻（書き直すと変わる）
    ratedAt: number;
}

/** 配信者の評価。record は取り込んだ最新の記録から、manual は手元で入力したもの */
export interface StreamerRating extends RatedPerson {
    rating: JoinRating;
    source: 'record' | 'manual';
}

/** 配信者の手元用（評価・注記つき） */
export interface JoinQueuePanelView {
    open: boolean;
    current: Omit<JoinQueueEntryView, 'position'> | null;
    entries: JoinQueueEntryView[];
    streamer: StreamerRating | null;
    room: RoomHazard;
    // いまのシフトの開始（これより前に申告した評価は古い。スケジュールが取れなければ null）
    shiftStart: number | null;
    recommended: {practice: number; normal: number; challenge: number} | null;
    revision: number;
}

/** 参加・取消の結果。reply は返信の文面（返さないときは null） */
export interface JoinCommandResult {
    result: 'joined' | 'updated' | 'cancelled' | 'notFound' | 'full' | 'closed' | 'ignored';
    position: number | null;
    reply: string | null;
}
