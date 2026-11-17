// コントロールパネルで決めるオーバーレイの設定（フォント・メッセージ・バーンダウンなど）の型・既定値・入力検証。
// クライアント（コントロールパネル）からも使う。保存は lib/streamSettings.ts（サーバー専用）

// プリセットごとのメッセージリストの型
export interface MessagePreset {
    name: string;
    messages: {id: number; text: string}[];
}

// バーンダウンチャート用のデータ型
export interface BurndownData {
    label: string;
    targetValue: number;
    entries: {score: number; timestamp: number}[]; // ポイントの履歴
}

export const TRANSITION_EFFECTS = ['fade', 'slide'] as const;
export type TransitionEffect = typeof TRANSITION_EFFECTS[number];

export interface StreamSettings {
    transitionEffect: TransitionEffect;
    transitionDuration: number;
    fontFamily: string;
    fontSize: number;
    messagePresets: MessagePreset[];
    activePresetName: string;
    burndown: BurndownData;
}

export const STREAM_SETTINGS_KEYS = [
    'transitionEffect',
    'transitionDuration',
    'fontFamily',
    'fontSize',
    'messagePresets',
    'activePresetName',
    'burndown',
] as const satisfies readonly (keyof StreamSettings)[];

export const DEFAULT_STREAM_SETTINGS: StreamSettings = {
    transitionEffect: 'fade',
    transitionDuration: 2,
    fontFamily: 'FOT-Kurokane Std',
    fontSize: 54,
    activePresetName: '通常',
    messagePresets: [
        {
            name: '通常', messages: [
                {id: 1, text: 'チャンネル登録・高評価お願いします！'},
                {id: 2, text: '応援のコメントお待ちしてます！'},
            ],
        },
        {
            name: '大会', messages: [
                {id: 1, text: 'チャンネル登録・高評価お願いします！'},
                {id: 2, text: '大会参加中！応援してね！'},
            ],
        },
        {
            name: 'ビッグラン', messages: [
                {id: 1, text: 'チャンネル登録・高評価お願いします！'},
                {id: 2, text: 'ハイスコア出せるWAVE引きたい'},
                {id: 3, text: '応援のコメントお待ちしてます！'},
            ],
        },
        {name: 'バチコン', messages: [{id: 1, text: 'チャンネル登録・高評価お願いします！'}]},
        {name: 'その他', messages: [{id: 1, text: 'チャンネル登録・高評価お願いします！'}]},
    ],
    burndown: {
        label: '目標まであと',
        targetValue: 50000,
        entries: [],
    },
};

// 入力の上限（SQLite に残すので、異常に大きな値を受け付けない）
export const MAX_FONT_FAMILY_LENGTH = 200;
export const MAX_FONT_SIZE = 1000;
export const MAX_TRANSITION_DURATION = 3600;
export const MAX_MESSAGE_PRESETS = 20;
export const MAX_PRESET_NAME_LENGTH = 50;
export const MAX_MESSAGES_PER_PRESET = 100;
export const MAX_MESSAGE_LENGTH = 500;
export const MAX_BURNDOWN_LABEL_LENGTH = 200;
export const MAX_BURNDOWN_ENTRIES = 10000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isText = (value: unknown, maxLength: number): value is string => typeof value === 'string' && value.length <= maxLength;

const isMessagePreset = (value: unknown): value is MessagePreset =>
    isRecord(value)
    && isText(value.name, MAX_PRESET_NAME_LENGTH)
    && Array.isArray(value.messages)
    && value.messages.length <= MAX_MESSAGES_PER_PRESET
    && value.messages.every((m) => isRecord(m) && isFiniteNumber(m.id) && isText(m.text, MAX_MESSAGE_LENGTH));

const isBurndown = (value: unknown): value is BurndownData =>
    isRecord(value)
    && isText(value.label, MAX_BURNDOWN_LABEL_LENGTH)
    && isFiniteNumber(value.targetValue)
    && Array.isArray(value.entries)
    && value.entries.length <= MAX_BURNDOWN_ENTRIES
    && value.entries.every((e) => isRecord(e) && isFiniteNumber(e.score) && isFiniteNumber(e.timestamp));

// 項目ごとの検証。値の形が正しければ true
const VALIDATORS: {[K in keyof StreamSettings]: (value: unknown) => boolean} = {
    transitionEffect: (v) => TRANSITION_EFFECTS.some((effect) => effect === v),
    transitionDuration: (v) => isFiniteNumber(v) && v > 0 && v <= MAX_TRANSITION_DURATION,
    fontFamily: (v) => isText(v, MAX_FONT_FAMILY_LENGTH),
    fontSize: (v) => isFiniteNumber(v) && v > 0 && v <= MAX_FONT_SIZE,
    messagePresets: (v) => Array.isArray(v) && v.length <= MAX_MESSAGE_PRESETS && v.every(isMessagePreset),
    activePresetName: (v) => isText(v, MAX_PRESET_NAME_LENGTH),
    burndown: isBurndown,
};

// 検証を通った値から、決まったキーだけを取り出す（余分なキーを SQLite に残さない）
const pickKnownKeys = <K extends keyof StreamSettings>(key: K, value: StreamSettings[K]): StreamSettings[K] => {
    if (key === 'messagePresets') {
        return (value as MessagePreset[]).map(({name, messages}) => ({
            name,
            messages: messages.map(({id, text}) => ({id, text})),
        })) as StreamSettings[K];
    }
    if (key === 'burndown') {
        const {label, targetValue, entries} = value as BurndownData;
        return {label, targetValue, entries: entries.map(({score, timestamp}) => ({score, timestamp}))} as StreamSettings[K];
    }
    return value;
};

/** 項目の値として受け付けられるか（コントロールパネルが、入力途中の不正な値を送らないために使う） */
export function isValidStreamSetting<K extends keyof StreamSettings>(key: K, value: unknown): value is StreamSettings[K] {
    return VALIDATORS[key](value);
}

export type StreamSettingsUpdateResult =
    | {ok: true; update: Partial<StreamSettings>}
    | {ok: false; message: string};

/**
 * 設定の部分更新（送った項目だけ書き換える）を検証する。設定の項目が 1 つも無い・知らない項目がある・値の形が違うときは失敗。
 * エフェクト（lastEvent）は PATCH {event} で出すので、ここでは受け付けない
 */
export function parseStreamSettingsUpdate(body: unknown): StreamSettingsUpdateResult {
    if (!isRecord(body)) return {ok: false, message: 'Body must be an object.'};
    const keys = Object.keys(body);
    const unknown = keys.filter((key) => !STREAM_SETTINGS_KEYS.some((k) => k === key));
    if (unknown.length > 0) return {ok: false, message: `Unknown fields: ${unknown.join(', ')}.`};
    if (keys.length === 0) return {ok: false, message: 'No settings to update.'};
    const invalid = STREAM_SETTINGS_KEYS.filter((key) => key in body && !isValidStreamSetting(key, body[key]));
    if (invalid.length > 0) return {ok: false, message: `Invalid fields: ${invalid.join(', ')}.`};
    const update: Partial<StreamSettings> = {};
    for (const key of STREAM_SETTINGS_KEYS) {
        if (key in body) (update as Record<string, unknown>)[key] = pickKnownKeys(key, body[key] as StreamSettings[typeof key]);
    }
    return {ok: true, update};
}

/** 保存値を読む。壊れた・不正な項目は既定値にする（ほかの項目は残す） */
export function parseStoredStreamSettings(stored: unknown): StreamSettings {
    const record = isRecord(stored) ? stored : {};
    const settings = {...DEFAULT_STREAM_SETTINGS};
    for (const key of STREAM_SETTINGS_KEYS) {
        if (key in record && isValidStreamSetting(key, record[key])) {
            (settings as Record<string, unknown>)[key] = pickKnownKeys(key, record[key] as StreamSettings[typeof key]);
        }
    }
    return settings;
}
