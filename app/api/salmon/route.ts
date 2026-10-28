import {NextResponse} from 'next/server';

import {addJob, deleteJob, getSummary, parseId, parseJob} from '../../../lib/salmon';

/** 現在のセッション（?sessionId= 指定時はそのセッション）の記録と合計 */
export async function GET(request: Request) {
    const param = new URL(request.url).searchParams.get('sessionId');
    if (param === null) return NextResponse.json(getSummary());

    const sessionId = parseId(param);
    if (sessionId === null) return NextResponse.json({message: 'sessionId must be a positive integer.'}, {status: 400});
    const summary = getSummary(sessionId);
    if (!summary.session) return NextResponse.json({message: 'Session not found.'}, {status: 404});
    return NextResponse.json(summary);
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

    const job = parseJob(body);
    if (typeof job === 'string') return NextResponse.json({message: job}, {status: 400});

    addJob(job);
    return NextResponse.json(getSummary());
}

/** 記録の取り消し（入力ミスの修正用） */
export async function DELETE(request: Request) {
    const id = parseId(new URL(request.url).searchParams.get('id'));
    if (id === null) return NextResponse.json({message: 'id must be a positive integer.'}, {status: 400});
    if (!deleteJob(id)) return NextResponse.json({message: 'Job not found.'}, {status: 404});
    return NextResponse.json(getSummary());
}
