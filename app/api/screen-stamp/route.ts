import {NextResponse} from 'next/server';

import {
    endScreenStampWindow,
    getScreenStampData,
    getScreenStampStats,
    loadScreenStampSettings,
    receiveChat,
    saveScreenStampSettings,
} from '../../../lib/screenStamp';
import {parseScreenStampSettings, SCREEN_STAMP_CHAT_MAX_LENGTH, SCREEN_STAMP_MAX_CHAT_EMOTES} from '../../../lib/screenStampTypes';

/**
 * いま出ている画面スタンプ（オーバーレイが 0.5 秒ごとに問い合わせる）。
 * `?view=settings` は設定、`?view=stats` は配信ごとの集計（コントロールパネル）
 */
export async function GET(request: Request) {
    const view = new URL(request.url).searchParams.get('view');
    if (view === 'settings') return NextResponse.json(loadScreenStampSettings());
    if (view === 'stats') return NextResponse.json({windows: getScreenStampStats()});
    return NextResponse.json(getScreenStampData());
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

const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((v) => typeof v === 'string');

/**
 * Twitch 連携スクリプトから。`{action: 'chat', userId, text, emotes?}` はチャットのメッセージ（text はスタンプを除いた文字、
 * emotes はメッセージのスタンプの名前）で、スタンプを出すか決める。`{action: 'offline'}` は配信の終了（集計の枠を閉じる）
 */
export async function POST(request: Request) {
    const json = await readJson(request);
    if (json instanceof NextResponse) return json;
    const {action, userId, text, emotes = []} = (json.body ?? {}) as Record<string, unknown>;
    if (action === 'offline') {
        endScreenStampWindow();
        return NextResponse.json({result: 'closed'});
    }
    if (action !== 'chat') return NextResponse.json({message: "action must be 'chat' or 'offline'."}, {status: 400});
    if (typeof userId !== 'string' || userId === '') return NextResponse.json({message: 'userId is required.'}, {status: 400});
    if (typeof text !== 'string' || Array.from(text).length > SCREEN_STAMP_CHAT_MAX_LENGTH) {
        return NextResponse.json({message: `text must be a string up to ${SCREEN_STAMP_CHAT_MAX_LENGTH} characters.`}, {status: 400});
    }
    if (!isStringArray(emotes) || emotes.length > SCREEN_STAMP_MAX_CHAT_EMOTES) {
        return NextResponse.json({message: `emotes must be an array of up to ${SCREEN_STAMP_MAX_CHAT_EMOTES} strings.`}, {status: 400});
    }
    const {result, stampId} = receiveChat(userId, text, emotes);
    return NextResponse.json({result, stampId});
}

/** 設定の保存（コントロールパネルの設定の「画面スタンプ」） */
export async function PUT(request: Request) {
    const json = await readJson(request);
    if (json instanceof NextResponse) return json;
    const settings = parseScreenStampSettings((json.body as Record<string, unknown> | null)?.settings);
    if (!settings) return NextResponse.json({message: 'Invalid settings.'}, {status: 400});
    saveScreenStampSettings(settings);
    return NextResponse.json(settings);
}
