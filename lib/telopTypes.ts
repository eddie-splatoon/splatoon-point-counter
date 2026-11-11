// 実況テロップの型と定数。クライアントからも使うため DB に依存させない

export const MAX_TELOP_PRESETS = 30;
export const MAX_TELOP_LENGTH = 30;
// オーバーレイに表示しておく時間（ミリ秒）
export const TELOP_DISPLAY_DURATION = 4000;
// コントロールパネルのキーボードショートカット。並び順の先頭から 1〜9, 0 を割り当てる
export const TELOP_SHORTCUT_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'] as const;

// フォローのお礼のテロップ。フォローした人の名前は入れない（フォロワー名は保持しない）
export const FOLLOW_TELOP_TEXT = 'フォローありがとうございます！🥳';
// 読み上げる文。VOICEVOX に絵文字を読ませない
export const FOLLOW_SPEECH_TEXT = 'フォローありがとうございます！';
// レイドの後などフォローが続いたときは、この間に 1 回だけ出す（間のフォローはサイドパネルのゲージの泡だけ）
export const FOLLOW_TELOP_COOLDOWN_MS = 15_000;
// 花火などの演出を見せるので、通常のテロップより長く出す
export const FOLLOW_TELOP_DISPLAY_DURATION = 8000;

// テロップの演出。follow: フォローのお礼（花火などを重ねて派手に出す）
export type TelopEffect = 'follow';

export interface TelopPreset {
    id: number;
    text: string;
    speak: boolean; // 合成音声（VOICEVOX）でも読み上げるか
    followFont: boolean; // 共通設定のフォントで表示するか。そのフォントに無い文字が化けるときは外して既定のフォントで出す
    chat: boolean; // Twitch のチャットにも配信者のコメントとして書き込むか（読み上げはコメント側で行う）
}

export interface TelopSettings {
    presets: TelopPreset[]; // 表示順（ショートカットの割り当て順）
}

export interface Telop {
    id: number;
    text: string;
    followFont: boolean;
    effect: TelopEffect | null; // 通常のテロップは null
    timestamp: number;
}

/** テロップを出しておく時間（ミリ秒） */
export const telopDisplayDuration = (telop: Pick<Telop, 'effect'>): number =>
    telop.effect === 'follow' ? FOLLOW_TELOP_DISPLAY_DURATION : TELOP_DISPLAY_DURATION;

export interface TelopData {
    presets: TelopPreset[];
    current: Telop | null; // 最後に出したテロップ。表示するかはオーバーレイが timestamp で決める
    revision: number;
    serverTime: number; // 応答時のサーバー時刻。オーバーレイは経過時間をこれで測る（ブラウザとサーバーの時計がずれていても表示時間を守るため）
}

/** Twitch のチャットへの書き込み待ち。Twitch 連携スクリプトが拾って書き込む */
export interface TelopChatPost {
    id: number;
    text: string;
    speak: boolean; // 書き込めなかったときにテロップ側で読み上げるか（本来テロップで読み上げる設定だったか）
    picked: boolean; // Twitch 連携スクリプトが拾ったか
    createdAt: number;
}

export const TELOP_CHAT_STATUSES = ['picked', 'sent', 'failed'] as const;
export type TelopChatStatus = typeof TELOP_CHAT_STATUSES[number];

export const getDefaultTelopSettings = (): TelopSettings => ({
    presets: [
        {id: 1, text: 'ナイス!', speak: true, followFont: true, chat: false},
        {id: 2, text: 'カタパッド残った…', speak: false, followFont: true, chat: false},
        {id: 3, text: '満潮きた', speak: false, followFont: true, chat: false},
        {id: 4, text: 'ヘルプ感謝', speak: true, followFont: true, chat: false},
    ],
});

/** テロップの文字列を整える。1 行にまとめ（改行・連続する空白は空白 1 つ）、空や上限超えなら null */
export function normalizeTelopText(text: string): string | null {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (normalized === '' || normalized.length > MAX_TELOP_LENGTH) return null;
    return normalized;
}

/** 設定を検証する。不正ならエラーメッセージを返す */
export function parseTelopSettings(body: unknown): TelopSettings | string {
    const invalid = `presets must be an array of up to ${MAX_TELOP_PRESETS} {id, text, speak, followFont, chat} with unique ids and text of 1-${MAX_TELOP_LENGTH} characters.`;
    const {presets} = (body ?? {}) as Record<string, unknown>;
    if (!Array.isArray(presets) || presets.length > MAX_TELOP_PRESETS) return invalid;
    const parsed: TelopPreset[] = [];
    for (const item of presets) {
        // followFont は後から追加した項目なので、保存済みのプリセットに無ければ共通設定のフォントに追従する
        // chat も後から追加した項目なので、無ければ書き込まない
        const {id, text, speak, followFont = true, chat = false} = (item ?? {}) as Record<string, unknown>;
        if (typeof id !== 'number' || !Number.isInteger(id) || id < 1 || typeof speak !== 'boolean' || typeof followFont !== 'boolean' || typeof chat !== 'boolean' || typeof text !== 'string') return invalid;
        const normalized = normalizeTelopText(text);
        if (normalized === null || parsed.some((p) => p.id === id)) return invalid;
        parsed.push({id, text: normalized, speak, followFont, chat});
    }
    return {presets: parsed};
}
