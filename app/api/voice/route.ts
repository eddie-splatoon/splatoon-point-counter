import {NextResponse} from 'next/server';

import {setAppState} from '../../../lib/db';
import {VOICE_STATE_KEY, loadVoiceSettings} from '../../../lib/speech';
import {parseVoiceSettings} from '../../../lib/voiceTypes';

/** 読み上げの設定（有効/無効・話者・速度・音量）。未保存、または不正なら既定値（読み上げ無効） */
export async function GET() {
    return NextResponse.json(loadVoiceSettings());
}

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

    const settings = parseVoiceSettings(body);
    if (typeof settings === 'string') return NextResponse.json({message: settings}, {status: 400});

    setAppState(VOICE_STATE_KEY, settings);
    return NextResponse.json(settings);
}
