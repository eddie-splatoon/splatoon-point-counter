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
// VOICEVOX の応答の上限。100 文字の wav は数 MB 程度なので、異常に大きい応答は読み込みながら打ち切る（メモリを使い切らないように）
export const MAX_AUDIO_QUERY_BYTES = 1_000_000;
export const MAX_WAV_BYTES = 20_000_000;

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
    // 合成した音声。同じ ID を何度要求されても VOICEVOX で合成するのは1回だけにする
    audio: Map<number, Promise<ArrayBuffer>>;
}
const globalStore = globalThis as typeof globalThis & {__speechQueue?: SpeechQueue};
// ID は起動時刻から振る。サーバーを再起動しても前の ID より大きくなるので、
// 開いたままのオーバーレイが新しい読み上げを「再生済み」と取り違えない
const queue = (): SpeechQueue => {
    const q = (globalStore.__speechQueue ??= {items: [], nextId: Date.now(), audio: new Map()});
    // 開発サーバーの再読み込みで、audio が無い以前の形のキューが globalThis に残っていることがある
    q.audio ??= new Map();
    return q;
};

/**
 * **FOR TESTING PURPOSES ONLY**
 * Clears the speech queue (the next id starts from the current time again).
 */
export function __TEST_ONLY_resetSpeechQueue() {
    delete globalStore.__speechQueue;
}

/** 古いものを捨てた読み上げキュー */
export function listSpeech(now = Date.now()): SpeechItem[] {
    const q = queue();
    q.items = q.items.filter((item) => now - item.createdAt < SPEECH_TTL_MS);
    for (const id of q.audio.keys()) {
        if (!q.items.some((item) => item.id === id)) q.audio.delete(id);
    }
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

/** 本文を読む。全体をメモリに載せる前に、バイト数が上限を超えた時点で読むのをやめる */
async function readLimitedBytes(res: Response, maxBytes: number): Promise<Uint8Array> {
    const tooLarge = () => new Error('VOICEVOX returned too large a response');
    if (Number(res.headers.get('content-length')) > maxBytes) throw tooLarge();
    if (!res.body) return new Uint8Array();
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
        const {done, value} = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
            await reader.cancel();
            throw tooLarge();
        }
        chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
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
    const queryRes = await voicevoxFetch(`/audio_query?text=${encodeURIComponent(text)}&speaker=${speaker}`, {method: 'POST'});
    const query: unknown = JSON.parse(new TextDecoder().decode(await readLimitedBytes(queryRes, MAX_AUDIO_QUERY_BYTES)));
    if (typeof query !== 'object' || query === null || Array.isArray(query)) throw new Error('VOICEVOX returned an unexpected audio query');
    const res = await voicevoxFetch(`/synthesis?speaker=${speaker}`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({...query, speedScale: settings.speedScale, volumeScale: settings.volumeScale}),
    });
    const wav = await readLimitedBytes(res, MAX_WAV_BYTES);
    return wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength) as ArrayBuffer;
}

/** キューの 1 件の音声。合成は ID ごとに 1 回だけ行い、失敗したら次の要求で合成し直す */
export function synthesizeSpeech(item: SpeechItem, settings: VoiceSettings & {speakerId: number}): Promise<ArrayBuffer> {
    const q = queue();
    const cached = q.audio.get(item.id);
    if (cached) return cached;
    const audio = synthesize(item.text, settings);
    audio.catch(() => q.audio.delete(item.id));
    q.audio.set(item.id, audio);
    return audio;
}
