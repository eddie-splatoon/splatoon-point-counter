import {NextResponse} from 'next/server';

import {setAppState} from '../../../lib/db';
import {enqueueSpeech} from '../../../lib/speech';
import {
    TELOP_STATE_KEY,
    expireChatPosts,
    getTelopData,
    loadPresets,
    queueChatPost,
    removeChatPost,
    showFollowTelop,
    showTelop,
} from '../../../lib/telop';
import {
    MAX_TELOP_LENGTH,
    TELOP_CHAT_STATUSES,
    TelopChatStatus,
    normalizeTelopText,
    parseTelopSettings,
} from '../../../lib/telopTypes';

/** `?view=chat` なら Twitch のチャットへの書き込み待ち（Twitch 連携スクリプト用）、それ以外はテロップの状態 */
export async function GET(request?: Request) {
    const chatPosts = expireChatPosts();
    if (request && new URL(request.url).searchParams.get('view') === 'chat') {
        return NextResponse.json({chatPosts});
    }
    return NextResponse.json(getTelopData());
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
 * プリセットの display が false なら画面のテロップには出さない（chat が true のものだけなので、コメントとして出る）。
 * 読み上げるものは読み上げキューにも入れる（読み上げが無効なら入れない）。
 * `{event: 'follow'}` はフォローのお礼（Twitch 連携スクリプトがフォローのたびに送る）。文言は固定で、演出付きで出して読み上げる。
 * 前回から FOLLOW_TELOP_COOLDOWN_MS 以内なら何もしない（レイドの後などに続けて出さない）
 */
export async function POST(request: Request) {
    const json = await readJson(request);
    if (json instanceof NextResponse) return json;
    const {presetId, text, followFont = true, speak, event} = (json.body ?? {}) as Record<string, unknown>;
    if (event !== undefined) {
        if (event !== 'follow' || presetId !== undefined || text !== undefined) {
            return NextResponse.json({message: "event must be 'follow' and cannot be combined with presetId or text."}, {status: 400});
        }
        showFollowTelop();
        return NextResponse.json(getTelopData());
    }
    if (speak !== undefined && typeof speak !== 'boolean') {
        return NextResponse.json({message: 'speak must be a boolean.'}, {status: 400});
    }

    let telop: {text: string; followFont: boolean};
    let shouldSpeak: boolean;
    let postToChat = false;
    let display = true;
    if (presetId !== undefined) {
        const preset = loadPresets().find((p) => p.id === presetId);
        if (!preset) return NextResponse.json({message: 'Preset not found.'}, {status: 404});
        telop = {text: preset.text, followFont: preset.followFont};
        shouldSpeak = preset.speak && speak !== false;
        postToChat = preset.chat;
        display = preset.display;
    } else {
        const telopText = typeof text === 'string' ? normalizeTelopText(text) : null;
        if (telopText === null || typeof followFont !== 'boolean') {
            return NextResponse.json({message: `Either presetId or a non-empty text of up to ${MAX_TELOP_LENGTH} characters (with optional booleans followFont and speak) is required.`}, {status: 400});
        }
        telop = {text: telopText, followFont};
        shouldSpeak = speak === true;
    }

    const now = Date.now();
    // テロップに出さない（コメントだけの）プリセットは、オーバーレイの表示を変えない
    if (display) showTelop({...telop, effect: null}, now);
    if (postToChat) {
        // 書き込んだコメントは配信者のコメントとして読み上げられるので、ここでは読まない（二重にならないように）。
        // 書き込めなかったときだけ、読み上げる設定ならテロップ側で読む
        queueChatPost(telop.text, shouldSpeak, now);
    } else if (shouldSpeak) {
        enqueueSpeech(telop.text);
    }
    return NextResponse.json(getTelopData());
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
    const post = expireChatPosts().find((p) => p.id === chatId);
    if (!post) return NextResponse.json({message: 'Chat post not found.'}, {status: 404});

    if ((status as TelopChatStatus) === 'picked') {
        post.picked = true;
    } else if (!post.picked) {
        // 結果は拾ったものにだけ受け付ける（拾う前に sent で消されて書き込まれない、などを防ぐ）
        return NextResponse.json({message: 'Chat post has not been picked.'}, {status: 409});
    } else {
        removeChatPost(chatId);
        if (status === 'failed' && post.speak) enqueueSpeech(post.text);
    }
    return NextResponse.json({chatPosts: expireChatPosts()});
}

/** プリセットを保存する */
export async function PUT(request: Request) {
    const json = await readJson(request);
    if (json instanceof NextResponse) return json;

    const settings = parseTelopSettings(json.body);
    if (typeof settings === 'string') return NextResponse.json({message: settings}, {status: 400});

    setAppState(TELOP_STATE_KEY, settings);
    return NextResponse.json(getTelopData());
}
