import {NextResponse} from 'next/server';

import {listSessions, startSession} from '../../../../lib/salmon';
import {MAX_TITLE_LENGTH} from '../../../../lib/salmonTypes';

/** 過去のセッション一覧（新しい順）と各セッションの合計 */
export async function GET() {
    return NextResponse.json(listSessions());
}

/** 新しいセッション（配信）を開始する。以降の記録はこのセッションに入る */
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

    const title = (body as {title?: unknown} | null)?.title;
    if (title !== undefined && typeof title !== 'string') {
        return NextResponse.json({message: 'title must be a string.'}, {status: 400});
    }

    return NextResponse.json(startSession((title ?? '').trim().slice(0, MAX_TITLE_LENGTH)));
}
