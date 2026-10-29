// 実況テロップの型と定数。クライアントからも使うため DB に依存させない

export const MAX_TELOP_PRESETS = 12;
export const MAX_TELOP_LENGTH = 30;
// オーバーレイに表示しておく時間（ミリ秒）
export const TELOP_DISPLAY_DURATION = 4000;
// コントロールパネルのキーボードショートカット。並び順の先頭から 1〜9, 0 を割り当てる
export const TELOP_SHORTCUT_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'] as const;

export interface TelopPreset {
    id: number;
    text: string;
    speak: boolean; // 合成音声でも読み上げるか（読み上げは別 Issue で対応）
}

export interface TelopSettings {
    presets: TelopPreset[]; // 表示順（ショートカットの割り当て順）
}

export interface Telop {
    id: number;
    text: string;
    timestamp: number;
}

export interface TelopData {
    presets: TelopPreset[];
    current: Telop | null; // 最後に出したテロップ。表示するかはオーバーレイが timestamp で決める
    revision: number;
    serverTime: number; // 応答時のサーバー時刻。オーバーレイは経過時間をこれで測る（ブラウザとサーバーの時計がずれていても表示時間を守るため）
}

export const getDefaultTelopSettings = (): TelopSettings => ({
    presets: [
        {id: 1, text: 'ナイス!', speak: true},
        {id: 2, text: 'カタパッド残った…', speak: false},
        {id: 3, text: '満潮きた', speak: false},
        {id: 4, text: 'ヘルプ感謝', speak: true},
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
    const invalid = `presets must be an array of up to ${MAX_TELOP_PRESETS} {id, text, speak} with unique ids and text of 1-${MAX_TELOP_LENGTH} characters.`;
    const {presets} = (body ?? {}) as Record<string, unknown>;
    if (!Array.isArray(presets) || presets.length > MAX_TELOP_PRESETS) return invalid;
    const parsed: TelopPreset[] = [];
    for (const item of presets) {
        const {id, text, speak} = (item ?? {}) as Record<string, unknown>;
        if (typeof id !== 'number' || !Number.isInteger(id) || id < 1 || typeof speak !== 'boolean' || typeof text !== 'string') return invalid;
        const normalized = normalizeTelopText(text);
        if (normalized === null || parsed.some((p) => p.id === id)) return invalid;
        parsed.push({id, text: normalized, speak});
    }
    return {presets: parsed};
}
