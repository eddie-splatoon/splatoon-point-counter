// 合成音声の読み上げキューと設定、VOICEVOX との通信（サーバー専用。node:sqlite と fetch を使う）
import {getAppState} from './db';
import {
    MAX_SPEECH_QUEUE,
    SPEECH_TTL_MS,
    SpeechItem,
    VoiceSettings,
    VoiceSpeaker,
    getDefaultVoiceSettings,
    normalizeSpeechText,
    parseSpeakers,
    parseVoiceSettings,
} from './voiceTypes';

export const VOICE_STATE_KEY = 'voice';
// 配信 PC で起動した VOICEVOX（アプリか Docker の voicevox_engine）。Docker でこのアプリを動かすときは host.docker.internal などに変える
const VOICEVOX_URL = (process.env.VOICEVOX_URL || 'http://localhost:50021').replace(/\/+$/, '');
// VOICEVOX が応答しないまま待ち続けると、オーバーレイの再生が止まるので打ち切る
export const VOICEVOX_TIMEOUT_MS = 10_000;

/** 保存済みの読み上げ設定。未保存、または不正なら既定値（読み上げ無効） */
export function loadVoiceSettings(): VoiceSettings {
    const saved = parseVoiceSettings(getAppState(VOICE_STATE_KEY));
    return typeof saved === 'string' ? getDefaultVoiceSettings() : saved;
}

// 読み上げキューはインメモリ。/api/speech と /api/telop など複数のルートから使うので、
// ルートごとにモジュールが別に読み込まれても同じキューを共有できるよう globalThis に置く
interface SpeechQueue {
    items: SpeechItem[];
    nextId: number;
}
const globalStore = globalThis as typeof globalThis & {__speechQueue?: SpeechQueue};
const queue = (): SpeechQueue => (globalStore.__speechQueue ??= {items: [], nextId: 1});

/**
 * **FOR TESTING PURPOSES ONLY**
 * Clears the speech queue.
 */
export function __TEST_ONLY_resetSpeechQueue() {
    globalStore.__speechQueue = {items: [], nextId: 1};
}

/** 古いものを捨てた読み上げキュー */
export function listSpeech(now = Date.now()): SpeechItem[] {
    const q = queue();
    q.items = q.items.filter((item) => now - item.createdAt < SPEECH_TTL_MS);
    return q.items;
}

export const findSpeech = (id: number): SpeechItem | undefined => listSpeech().find((item) => item.id === id);

/** 読み上げキューに追加する。読み上げが無効、話者が未選択、文が空なら追加せず null */
export function enqueueSpeech(text: string): SpeechItem | null {
    const settings = loadVoiceSettings();
    const normalized = normalizeSpeechText(text);
    if (!settings.enabled || settings.speakerId === null || normalized === null) return null;
    const q = queue();
    const item: SpeechItem = {id: q.nextId++, text: normalized, createdAt: Date.now()};
    // 溜まりすぎたら古いものから捨てる
    q.items = [...listSpeech(), item].slice(-MAX_SPEECH_QUEUE);
    return item;
}

async function voicevoxFetch(path: string, init?: RequestInit): Promise<Response> {
    const res = await fetch(`${VOICEVOX_URL}${path}`, {...init, cache: 'no-store', signal: AbortSignal.timeout(VOICEVOX_TIMEOUT_MS)});
    if (!res.ok) throw new Error(`VOICEVOX ${path.split('?')[0]} returned ${res.status}`);
    return res;
}

/** VOICEVOX の話者（キャラクター）とスタイルの一覧 */
export async function fetchSpeakers(): Promise<VoiceSpeaker[]> {
    return parseSpeakers(await (await voicevoxFetch('/speakers')).json());
}

/** 文を音声（wav）にする。速度と音量は設定の値を使う */
export async function synthesize(text: string, settings: VoiceSettings & {speakerId: number}): Promise<ArrayBuffer> {
    const speaker = encodeURIComponent(String(settings.speakerId));
    const query = await (await voicevoxFetch(`/audio_query?text=${encodeURIComponent(text)}&speaker=${speaker}`, {method: 'POST'})).json();
    const res = await voicevoxFetch(`/synthesis?speaker=${speaker}`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({...query, speedScale: settings.speedScale, volumeScale: settings.volumeScale}),
    });
    return res.arrayBuffer();
}
