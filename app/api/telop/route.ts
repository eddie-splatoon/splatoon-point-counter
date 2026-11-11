import {NextResponse} from 'next/server';

import {getAppState, setAppState} from '../../../lib/db';
import {enqueueSpeech} from '../../../lib/speech';
import {
    MAX_TELOP_LENGTH,
    TELOP_CHAT_STATUSES,
    Telop,
    TelopChatPost,
    TelopChatStatus,
    TelopData,
    getDefaultTelopSettings,
    normalizeTelopText,
    parseTelopSettings,
} from '../../../lib/telopTypes';

const STATE_KEY = 'telop';
// Twitch 連携スクリプトが拾わなければ（未起動）、この時間でコメントをあきらめてテロップ側で読み上げる
export const CHAT_PICKUP_TTL_MS = 3000;
// 拾った後に結果が届かなければ、この時間で読み上げずに捨てる（書き込めたかわからないので、二重に読まない）
export const CHAT_RESULT_TTL_MS = 30000;
const MAX_CHAT_POSTS = 20;

// いま出ているテロップはインメモリで持つ（字幕と同じく、再起動したら消えてよい）。プリセットは SQLite に保存する
let current: Telop | null = null;
let revision = 0;
// Twitch のチャットへの書き込み待ち。ID は起動時刻から振る（再起動後に、スクリプトが試した ID と重ならないように）
let chatPosts: TelopChatPost[] = [];
let nextChatId = Date.now();

/**
 * **FOR TESTING PURPOSES ONLY**
 * Resets the in-memory telop.
 */
export function __TEST_ONLY_resetTelop() {
    current = null;
    revision = 0;
    chatPosts = [];
    nextChatId = 1;
}

/** 期限を過ぎた書き込み待ちを外す。拾われなかったものは、読み上げる設定ならテロップ側で読み上げる */
function expireChatPosts(now = Date.now()) {
    chatPosts = chatPosts.filter((post) => {
        if (post.picked) return now - post.createdAt < CHAT_RESULT_TTL_MS;
        if (now - post.createdAt < CHAT_PICKUP_TTL_MS) return true;
        if (post.speak) enqueueSpeech(post.text);
        return false;
    });
}

/** 保存済みのプリセット。未保存、または不正なら既定値 */
const loadPresets = () => {
    const saved = parseTelopSettings(getAppState(STATE_KEY));
    return (typeof saved === 'string' ? getDefaultTelopSettings() : saved).presets;
};

const toData = (): TelopData => ({presets: loadPresets(), current, revision, serverTime: Date.now()});

/** `?view=chat` なら Twitch のチャットへの書き込み待ち（Twitch 連携スクリプト用）、それ以外はテロップの状態 */
export async function GET(request?: Request) {
    expireChatPosts();
    if (request && new URL(request.url).searchParams.get('view') === 'chat') {
        return NextResponse.json({chatPosts});
    }
    return NextResponse.json(toData());
}

// 他サイトからプリフライトなしで送れる text/plain などの「単純リクエスト」を拒否する
async function readJson(request: Request): Promise<{body: unknown} | NextResponse> {
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
        return NextResponse.json({message: 'Content-Type must be application/json.'}, {status: 415});
    }
    try {
        return {body: await request.json()};
    } catch {
        return NextResponse.json({message: 'Invalid JSON.'}, {status: 400});
    }
}

/**
 * テロップを出す。`{presetId, speak?}` でプリセットを、`{text, followFont?, speak?}` で自由入力の文を出す（Stream Deck などからも同じ形で送れる）。
 * 自由入力の followFont（共通設定のフォントで表示するか）は省略すると true、speak（読み上げるか）は省略すると false。
 * プリセットはその設定どおりに読み上げるが、`speak: false` なら読み上げない（文字起こしから出すときに、配信者の声と重ならないように）。
 * 読み上げるものは読み上げキューにも入れる（読み上げが無効なら入れない）
 */
export async function POST(request: Request) {
    const json = await readJson(request);
    if (json instanceof NextResponse) return json;
    const {presetId, text, followFont = true, speak} = (json.body ?? {}) as Record<string, unknown>;
    if (speak !== undefined && typeof speak !== 'boolean') {
        return NextResponse.json({message: 'speak must be a boolean.'}, {status: 400});
    }

    let telop: {text: string; followFont: boolean};
    let shouldSpeak: boolean;
    let postToChat = false;
    if (presetId !== undefined) {
        const preset = loadPresets().find((p) => p.id === presetId);
        if (!preset) return NextResponse.json({message: 'Preset not found.'}, {status: 404});
        telop = {text: preset.text, followFont: preset.followFont};
        shouldSpeak = preset.speak && speak !== false;
        postToChat = preset.chat;
    } else {
        const telopText = typeof text === 'string' ? normalizeTelopText(text) : null;
        if (telopText === null || typeof followFont !== 'boolean') {
            return NextResponse.json({message: `Either presetId or a non-empty text of up to ${MAX_TELOP_LENGTH} characters (with optional booleans followFont and speak) is required.`}, {status: 400});
        }
        telop = {text: telopText, followFont};
        shouldSpeak = speak === true;
    }

    revision += 1;
    const now = Date.now();
    current = {id: revision, ...telop, timestamp: now};
    if (postToChat) {
        // 書き込んだコメントは配信者のコメントとして読み上げられるので、ここでは読まない（二重にならないように）。
        // 書き込めなかったときだけ、読み上げる設定ならテロップ側で読む
        expireChatPosts(now);
        chatPosts = [...chatPosts, {id: nextChatId++, text: telop.text, speak: shouldSpeak, picked: false, createdAt: now}].slice(-MAX_CHAT_POSTS);
    } else if (shouldSpeak) {
        enqueueSpeech(telop.text);
    }
    return NextResponse.json(toData());
}

/**
 * Twitch 連携スクリプトから、チャットへの書き込みの状況を受け取る。`{chatId, status}`。
 * picked: 拾った（拾われないまま期限切れにしない）、sent: 書き込めた、failed: 書き込めなかった（読み上げる設定なら読み上げる）
 */
export async function PATCH(request: Request) {
    const json = await readJson(request);
    if (json instanceof NextResponse) return json;
    const {chatId, status} = (json.body ?? {}) as Record<string, unknown>;
    if (typeof chatId !== 'number' || !(TELOP_CHAT_STATUSES as readonly unknown[]).includes(status)) {
        return NextResponse.json({message: `chatId (number) and status (${TELOP_CHAT_STATUSES.join(' | ')}) are required.`}, {status: 400});
    }
    expireChatPosts();
    const post = chatPosts.find((p) => p.id === chatId);
    if (!post) return NextResponse.json({message: 'Chat post not found.'}, {status: 404});

    if ((status as TelopChatStatus) === 'picked') {
        post.picked = true;
    } else {
        chatPosts = chatPosts.filter((p) => p.id !== chatId);
        if (status === 'failed' && post.speak) enqueueSpeech(post.text);
    }
    return NextResponse.json({chatPosts});
}

/** プリセットを保存する */
export async function PUT(request: Request) {
    const json = await readJson(request);
    if (json instanceof NextResponse) return json;

    const settings = parseTelopSettings(json.body);
    if (typeof settings === 'string') return NextResponse.json({message: settings}, {status: 400});

    setAppState(STATE_KEY, settings);
    return NextResponse.json(toData());
}
