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

// ---- API の型 ----

/** 配信画面用（番号・表示名だけ。評価は出さない） */
export interface JoinQueuePublicView {
    open: boolean;
    current: string | null;
    entries: {position: number; userName: string}[];
    revision: number;
}

export interface JoinQueueEntryView {
    position: number;
    userId: string;
    userName: string;
    rating: JoinRating | null;
    unreadable: boolean;
    joinedAt: number;
}

/** 配信者の手元用（評価・注記つき） */
export interface JoinQueuePanelView {
    open: boolean;
    current: Omit<JoinQueueEntryView, 'position'> | null;
    entries: JoinQueueEntryView[];
    revision: number;
}

/** 参加・取消の結果。reply は返信の文面（返さないときは null） */
export interface JoinCommandResult {
    result: 'joined' | 'updated' | 'cancelled' | 'notFound' | 'full' | 'closed' | 'ignored';
    position: number | null;
    reply: string | null;
}
