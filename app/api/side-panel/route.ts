import {NextResponse} from 'next/server';

import {getAppState, setAppState} from '../../../lib/db';
import {getDefaultSidePanelSettings, parseSidePanelSettings} from '../../../lib/sidePanelTypes';

const STATE_KEY = 'sidePanel';

/** 保存済みの設定。未保存、または保存後にスロットが無くなるなどして不正なら既定値 */
export async function GET() {
    const saved = parseSidePanelSettings(getAppState(STATE_KEY));
    return NextResponse.json(typeof saved === 'string' ? getDefaultSidePanelSettings() : saved);
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

    const settings = parseSidePanelSettings(body);
    if (typeof settings === 'string') return NextResponse.json({message: settings}, {status: 400});

    setAppState(STATE_KEY, settings);
    return NextResponse.json(settings);
}
