import {NextResponse} from 'next/server';

import {addJob, deleteJob, getSummary, parseId, parseJob, updateJob} from '../../../lib/salmon';

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

/** JSON の本文。Content-Type が JSON でなければ 415、壊れていれば 400 の応答 */
async function readJson(request: Request): Promise<{body: unknown} | NextResponse> {
    // 他サイトからプリフライトなしで送れる text/plain などの「単純リクエスト」を拒否する
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
        return NextResponse.json({message: 'Content-Type must be application/json.'}, {status: 415});
    }
    try {
        return {body: await request.json()};
    } catch {
        return NextResponse.json({message: 'Invalid JSON.'}, {status: 400});
    }
}

export async function POST(request: Request) {
    const read = await readJson(request);
    if (read instanceof NextResponse) return read;
    const {body} = read;

    const job = parseJob(body);
    if (typeof job === 'string') return NextResponse.json({message: job}, {status: 400});

    addJob(job);
    return NextResponse.json(getSummary());
}

/** 記録の修正（{id, ...記録}）。取り込みの読み間違いは削除→手入力ではなくこれで直す（日時が残るので二重に取り込まない） */
export async function PATCH(request: Request) {
    const read = await readJson(request);
    if (read instanceof NextResponse) return read;

    const id = (read.body as {id?: unknown} | null)?.id;
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) return NextResponse.json({message: 'id must be a positive integer.'}, {status: 400});
    const job = parseJob(read.body);
    if (typeof job === 'string') return NextResponse.json({message: job}, {status: 400});

    if (!updateJob(id, job)) return NextResponse.json({message: 'Job not found.'}, {status: 404});
    return NextResponse.json(getSummary());
}

/** 記録の取り消し（入力ミスの修正用） */
export async function DELETE(request: Request) {
    const id = parseId(new URL(request.url).searchParams.get('id'));
    if (id === null) return NextResponse.json({message: 'id must be a positive integer.'}, {status: 400});
    if (!deleteJob(id)) return NextResponse.json({message: 'Job not found.'}, {status: 404});
    return NextResponse.json(getSummary());
}
