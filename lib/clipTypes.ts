// Twitch のクリップの依頼の型と定数。コントロールパネルからも使うため、DB（node:sqlite）に依存する lib/clips.ts とは分けている

export const CLIP_SOURCES = ['voice', 'button'] as const;
export type ClipSource = (typeof CLIP_SOURCES)[number];

export const CLIP_SOURCE_LABELS: Record<ClipSource, string> = {voice: '声', button: 'ボタン'};

export type ClipStatus = 'pending' | 'created' | 'failed';

// この時間内に Twitch 連携スクリプトが処理しなかった依頼は期限切れにする（後から別の瞬間のクリップが作られないように）
export const CLIP_REQUEST_TTL_MS = 30_000;
export const CLIP_EXPIRED_ERROR = '期限切れ（Twitch 連携スクリプトが起動していない可能性があります）';
export const MAX_CLIP_ERROR_LENGTH = 200;
const MAX_EDIT_URL_LENGTH = 500;
const CLIP_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

export interface ClipRequest {
    id: number;
    source: ClipSource;
    status: ClipStatus;
    requestedAt: number;
    completedAt: number | null;
    clipId: string | null;
    editUrl: string | null;
    error: string | null;
}

export type ClipResult =
    | {status: 'created'; clipId: string; editUrl: string}
    | {status: 'failed'; error: string};

export const clipUrl = (clipId: string) => `https://clips.twitch.tv/${encodeURIComponent(clipId)}`;

export const isClipSource = (value: unknown): value is ClipSource => CLIP_SOURCES.includes(value as ClipSource);

const isHttpsUrl = (value: unknown): value is string => {
    if (typeof value !== 'string' || value.length > MAX_EDIT_URL_LENGTH) return false;
    try {
        return new URL(value).protocol === 'https:';
    } catch {
        return false;
    }
};

/** PATCH /api/clip の本文を検証する。不正ならエラーメッセージ */
export function parseClipResult(body: unknown): {id: number; result: ClipResult} | string {
    const {id, status, clipId, editUrl, error} = (body ?? {}) as Record<string, unknown>;
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) return 'id must be a positive integer.';
    if (status === 'created') {
        if (typeof clipId !== 'string' || !CLIP_ID_PATTERN.test(clipId)) return 'clipId must be a Twitch clip ID.';
        if (!isHttpsUrl(editUrl)) return 'editUrl must be an https URL.';
        return {id, result: {status, clipId, editUrl}};
    }
    if (status === 'failed') {
        if (typeof error !== 'string' || error.trim() === '') return 'error must be a non-empty string.';
        return {id, result: {status, error: Array.from(error.trim()).slice(0, MAX_CLIP_ERROR_LENGTH).join('')}};
    }
    return "status must be 'created' or 'failed'.";
}
