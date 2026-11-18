// 画面スタンプ（チャットの「ナイス」などを配信画面に大きく出す）の型・定数・判定・設定の検証（クライアントからも使う）
import {normalizeJoinText} from './joinQueueTypes';

/**
 * スタンプ 1 つ。label は画面に出す文字、words はチャットでこれだけ書かれたら出す言葉。
 * emotes はフォロワースタンプの名前（コード。例: eddiesp2Nice）で、メッセージに含まれていたら出す（スタンプの絵を差し替えると ID も名前も変わるので、ID ではなく設定の名前で照合する）。
 * imageUrl は画面に出す画像（無ければ label を文字で描く）
 */
export interface ScreenStampDefinition {
    id: string;
    label: string;
    words: string[];
    emotes: string[];
    imageUrl: string | null;
}

export interface ScreenStampSettings {
    enabled: boolean;
    stamps: ScreenStampDefinition[];
}

/** いま出ているスタンプ（GET /api/screen-stamp の current） */
export interface ScreenStampShown {
    id: number;
    stampId: string;
    label: string;
    imageUrl: string | null;
    /** 出した時刻（サーバーの時計） */
    timestamp: number;
}

export interface ScreenStampData {
    current: ScreenStampShown | null;
    /** 応答したときのサーバーの時計（経過時間をブラウザの時計に置き換えるため） */
    serverTime: number;
}

/** 配信の枠ごとの集計。出した人の名前・本文は残さない */
export interface ScreenStampWindowStats {
    startedAt: number;
    /** 配信の終了で閉じた時刻。今の配信なら null */
    endedAt: number | null;
    /** 最後にスタンプを出した時刻（配信の終了が届かなかったときに、間が空いたら枠を閉じるため） */
    lastShownAt: number;
    stamps: {id: string; label: string; shown: number; users: number}[];
}

export type ScreenStampChatResult = 'disabled' | 'none' | 'throttled' | 'shown';

export const SCREEN_STAMP_DISPLAY_MS = 2000;
/** 同じスタンプを出し直さない時間 */
export const SCREEN_STAMP_SAME_INTERVAL_MS = 10_000;
/** どのスタンプも出さない時間（前のスタンプを出してから） */
export const SCREEN_STAMP_GLOBAL_INTERVAL_MS = 3000;
export const SCREEN_STAMP_MAX_STAMPS = 8;
export const SCREEN_STAMP_MAX_WORDS = 10;
export const SCREEN_STAMP_LABEL_MAX_LENGTH = 8;
export const SCREEN_STAMP_WORD_MAX_LENGTH = 20;
export const SCREEN_STAMP_MAX_EMOTES = 5;
export const SCREEN_STAMP_IMAGE_URL_MAX_LENGTH = 500;
/** スクリプトから受け取るチャットの長さ（言葉だけの短いメッセージしか一致しないので、これより長いものは見ない） */
export const SCREEN_STAMP_CHAT_MAX_LENGTH = 50;
/** スクリプトから受け取る 1 メッセージのスタンプの名前の数（重複は除いて送る） */
export const SCREEN_STAMP_MAX_CHAT_EMOTES = 20;
/** 配信の終了が届かなくても（Twitch 連携スクリプトが止まっていたなど）、スタンプがこの時間出なければ配信の枠を閉じる */
export const SCREEN_STAMP_WINDOW_GAP_MS = 6 * 60 * 60_000;
/** 集計を残す日数 */
export const SCREEN_STAMP_STATS_DAYS = 28;

export const DEFAULT_SCREEN_STAMP_SETTINGS: ScreenStampSettings = {
    enabled: true,
    stamps: [
        {id: 'nice', label: 'ナイス', words: ['ないす', 'nice'], emotes: [], imageUrl: null},
        {id: 'donmai', label: 'ドンマイ', words: ['どんまい', 'donmai'], emotes: [], imageUrl: null},
        {id: 'kansuto', label: 'カンスト', words: ['かんすと'], emotes: [], imageUrl: null},
    ],
};

const STAMP_ID_PATTERN = /^[a-z0-9-]{1,40}$/;
// Twitch のスタンプの名前（英数字。修飾付きのスタンプは「_」で続く）
const EMOTE_NAME_PATTERN = /^[A-Za-z0-9_]{1,50}$/;
// 末尾の伸ばし・感嘆（「ナイス!!」「ないすぅ」「ナイスー」「ナイス〜」）
const TRAILING_PATTERN = /[!ーぅ〜~\s]+$/u;

/**
 * 参加受付と同じ前処理（NFKC・ゼロ幅 / 方向制御文字の除去・小文字・カタカナ→ひらがな）のあと、
 * 先頭の「!」を 1 つ（「!ナイス」の形）と、末尾の「!」「ー」「ぅ」「〜」と空白を除く
 */
export function normalizeStampText(text: string): string {
    return normalizeJoinText(text).replace(/^!\s*/, '').replace(TRAILING_PATTERN, '').trim();
}

/**
 * 出すスタンプ。設定のフォロワースタンプの名前がメッセージにあればそれ（メッセージのいちばん前のもの）、
 * 無ければメッセージ全体（スタンプを除いた文字）が辞書の言葉と完全に一致したもの（文の一部に含まれるだけのものは出さない）。無ければ null
 */
export function matchScreenStamp(text: string, stamps: ScreenStampDefinition[], emotes: string[] = []): ScreenStampDefinition | null {
    for (const emote of emotes) {
        const stamp = stamps.find((s) => s.emotes.includes(emote));
        if (stamp) return stamp;
    }
    const normalized = normalizeStampText(text);
    if (normalized === '') return null;
    return stamps.find((stamp) => [stamp.label, ...stamp.words].some((word) => normalizeStampText(word) === normalized)) ?? null;
}

/** 画面に出す画像の URL として受け付けるもの（https か、public/ に置いた画像の「/」から始まるパス） */
export const isStampImageUrl = (value: string): boolean =>
    value.length <= SCREEN_STAMP_IMAGE_URL_MAX_LENGTH && !/\s/.test(value) && (/^https:\/\/[^/]/.test(value) || /^\/(?!\/)/.test(value));

const length = (text: string) => Array.from(text).length;

function parseStamp(value: unknown): ScreenStampDefinition | null {
    if (typeof value !== 'object' || value === null) return null;
    // emotes・imageUrl は後から足した項目なので、無ければ空として扱う
    const {id, label, words, emotes = [], imageUrl = null} = value as Record<string, unknown>;
    if (typeof id !== 'string' || !STAMP_ID_PATTERN.test(id)) return null;
    if (typeof label !== 'string') return null;
    const trimmed = label.trim();
    if (trimmed === '' || length(trimmed) > SCREEN_STAMP_LABEL_MAX_LENGTH || /[\r\n]/.test(trimmed)) return null;
    if (!Array.isArray(words) || words.length > SCREEN_STAMP_MAX_WORDS) return null;
    const parsedWords: string[] = [];
    for (const word of words) {
        if (typeof word !== 'string') return null;
        const w = word.trim();
        if (w === '' || length(w) > SCREEN_STAMP_WORD_MAX_LENGTH || /[\r\n]/.test(w)) return null;
        parsedWords.push(w);
    }
    if (!Array.isArray(emotes) || emotes.length > SCREEN_STAMP_MAX_EMOTES) return null;
    const parsedEmotes: string[] = [];
    for (const emote of emotes) {
        if (typeof emote !== 'string' || !EMOTE_NAME_PATTERN.test(emote.trim())) return null;
        parsedEmotes.push(emote.trim());
    }
    let parsedImage: string | null = null;
    if (imageUrl !== null) {
        if (typeof imageUrl !== 'string') return null;
        const url = imageUrl.trim();
        if (url !== '') {
            if (!isStampImageUrl(url)) return null;
            parsedImage = url;
        }
    }
    return {id, label: trimmed, words: parsedWords, emotes: parsedEmotes, imageUrl: parsedImage};
}

/** 設定の検証（PUT）。不正なら null。スタンプの id・フォロワースタンプの名前は重ねられない */
export function parseScreenStampSettings(value: unknown): ScreenStampSettings | null {
    if (typeof value !== 'object' || value === null) return null;
    const {enabled, stamps} = value as Record<string, unknown>;
    if (typeof enabled !== 'boolean' || !Array.isArray(stamps) || stamps.length > SCREEN_STAMP_MAX_STAMPS) return null;
    const parsed: ScreenStampDefinition[] = [];
    for (const stamp of stamps) {
        const s = parseStamp(stamp);
        if (!s || parsed.some((p) => p.id === s.id || p.emotes.some((e) => s.emotes.includes(e)))) return null;
        parsed.push(s);
    }
    return {enabled, stamps: parsed};
}

/** 保存値を読む（壊れていれば既定値） */
export const parseStoredScreenStampSettings = (value: unknown): ScreenStampSettings =>
    parseScreenStampSettings(value) ?? DEFAULT_SCREEN_STAMP_SETTINGS;

/** 言葉の入力欄（読点・カンマ・改行区切り）を言葉の一覧にする */
export const splitStampWords = (text: string): string[] =>
    text.split(/[、,，\n]/).map((w) => w.trim()).filter((w) => w !== '');
