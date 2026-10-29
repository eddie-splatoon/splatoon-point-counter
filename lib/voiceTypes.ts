// 合成音声（VOICEVOX）の読み上げの型と定数。クライアントからも使うため DB や fetch に依存させない

// 読み上げキュー: 1 件の文字数、件数、残しておく時間（読み上げ待ちが溜まりすぎないように古いものから捨てる）
export const MAX_SPEECH_LENGTH = 100;
export const MAX_SPEECH_QUEUE = 20;
export const SPEECH_TTL_MS = 60_000;

export const MIN_SPEED_SCALE = 0.5;
export const MAX_SPEED_SCALE = 2;
export const MIN_VOLUME_SCALE = 0;
export const MAX_VOLUME_SCALE = 2;

export interface VoiceSettings {
    enabled: boolean;
    speakerId: number | null; // VOICEVOX のスタイル ID（未選択なら null で、読み上げない）
    speakerName: string; // クレジット表記に使うキャラクター名
    speedScale: number;
    volumeScale: number;
}

export interface SpeechItem {
    id: number;
    text: string;
    createdAt: number;
}

export interface SpeechData {
    items: SpeechItem[];
    serverTime: number;
}

export interface VoiceSpeaker {
    name: string;
    styles: {id: number; name: string}[];
}

export const getDefaultVoiceSettings = (): VoiceSettings => ({
    enabled: false,
    speakerId: null,
    speakerName: '',
    speedScale: 1,
    volumeScale: 1,
});

/** VOICEVOX のキャラクターの規約で求められるクレジット表記 */
export const voiceCredit = (speakerName: string) => `VOICEVOX:${speakerName}`;

/** 読み上げる文を整える。1 行にまとめ（改行・連続する空白は空白 1 つ）、長すぎる分は切り詰める。空なら null */
export function normalizeSpeechText(text: string): string | null {
    const normalized = text.replace(/\s+/g, ' ').trim();
    return normalized === '' ? null : normalized.slice(0, MAX_SPEECH_LENGTH);
}

const isNumberBetween = (value: unknown, min: number, max: number): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

/** 設定を検証する。不正ならエラーメッセージを返す */
export function parseVoiceSettings(body: unknown): VoiceSettings | string {
    const {enabled, speakerId, speakerName, speedScale, volumeScale} = (body ?? {}) as Record<string, unknown>;
    if (typeof enabled !== 'boolean') return 'enabled must be a boolean.';
    if (speakerId !== null && (typeof speakerId !== 'number' || !Number.isInteger(speakerId) || speakerId < 0)) return 'speakerId must be null or a non-negative integer.';
    if (typeof speakerName !== 'string' || speakerName.length > 50) return 'speakerName must be a string of up to 50 characters.';
    if (!isNumberBetween(speedScale, MIN_SPEED_SCALE, MAX_SPEED_SCALE)) return `speedScale must be between ${MIN_SPEED_SCALE} and ${MAX_SPEED_SCALE}.`;
    if (!isNumberBetween(volumeScale, MIN_VOLUME_SCALE, MAX_VOLUME_SCALE)) return `volumeScale must be between ${MIN_VOLUME_SCALE} and ${MAX_VOLUME_SCALE}.`;
    return {enabled, speakerId, speakerName: speakerName.trim(), speedScale, volumeScale};
}

/** VOICEVOX の /speakers の応答から、名前とスタイルだけを取り出す。形が想定と違う要素は捨てる */
export function parseSpeakers(body: unknown): VoiceSpeaker[] {
    if (!Array.isArray(body)) return [];
    const speakers: VoiceSpeaker[] = [];
    for (const item of body) {
        const {name, styles} = (item ?? {}) as Record<string, unknown>;
        if (typeof name !== 'string' || !Array.isArray(styles)) continue;
        const parsedStyles = styles
            .map((style) => (style ?? {}) as Record<string, unknown>)
            // 歌唱用のスタイル（type が talk 以外）は読み上げ（audio_query）に使えないので除く。古いエンジンには type が無い
            .filter((style) => style.type === undefined || style.type === 'talk')
            .filter((style): style is {id: number; name: string} => typeof style.id === 'number' && typeof style.name === 'string')
            .map(({id, name: styleName}) => ({id, name: styleName}));
        if (parsedStyles.length > 0) speakers.push({name, styles: parsedStyles});
    }
    return speakers;
}
