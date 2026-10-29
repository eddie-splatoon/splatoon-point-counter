import {NextResponse} from 'next/server';

import {enqueueSpeech, listSpeech} from '../../../lib/speech';
import {SpeechData} from '../../../lib/voiceTypes';

/** 読み上げキュー。音声専用オーバーレイ（/voice-overlay）が問い合わせ、まだ再生していないものを順に再生する */
export async function GET() {
    const data: SpeechData = {items: listSpeech(), serverTime: Date.now()};
    return NextResponse.json(data);
}

/** 読み上げキューに文を追加する。読み上げが無効、または話者が未選択なら 409 */
export async function POST(request: Request) {
    // 他サイトからプリフライトなしで送れる text/plain などの「単純リクエスト」を拒否する
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
        return NextResponse.json({message: 'Content-Type must be application/json.'}, {status: 415});
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({message: 'Invalid JSON.'}, {status: 400});
    }

    const text = (body as {text?: unknown} | null)?.text;
    if (typeof text !== 'string' || text.trim() === '') {
        return NextResponse.json({message: 'text must be a non-empty string.'}, {status: 400});
    }

    const item = enqueueSpeech(text);
    if (!item) return NextResponse.json({message: 'Speech is disabled or no speaker is selected.'}, {status: 409});
    return NextResponse.json(item);
}
