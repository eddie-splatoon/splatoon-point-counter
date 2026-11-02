import {NextResponse} from 'next/server';

import {completeClip, deleteClip, listClips, listPendingClips, requestClip} from '../../../lib/clips';
import {isClipSource, parseClipResult} from '../../../lib/clipTypes';

/** クリップの依頼の一覧（新しい順）。`?status=pending` なら処理待ちだけ（古い順。Twitch 連携スクリプトが使う） */
export async function GET(request: Request) {
    const pendingOnly = new URL(request.url).searchParams.get('status') === 'pending';
    return NextResponse.json({clips: pendingOnly ? listPendingClips() : listClips()});
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

/** クリップを依頼する（`{source?}`。既定は voice）。処理待ちの依頼があれば新しく作らずにそれを返す */
export async function POST(request: Request) {
    const json = await readJson(request);
    if (json instanceof NextResponse) return json;
    const {source = 'voice'} = (json.body ?? {}) as {source?: unknown};
    if (!isClipSource(source)) return NextResponse.json({message: "source must be 'voice' or 'button'."}, {status: 400});
    return NextResponse.json({clip: requestClip(source)});
}

/** 依頼の結果を書き込む（Twitch 連携スクリプトから） */
export async function PATCH(request: Request) {
    const json = await readJson(request);
    if (json instanceof NextResponse) return json;
    const parsed = parseClipResult(json.body);
    if (typeof parsed === 'string') return NextResponse.json({message: parsed}, {status: 400});
    const clip = completeClip(parsed.id, parsed.result);
    if (!clip) return NextResponse.json({message: 'Pending clip request not found.'}, {status: 404});
    return NextResponse.json({clip});
}

/** 履歴から消す（Twitch 上のクリップは消さない） */
export async function DELETE(request: Request) {
    const id = Number(new URL(request.url).searchParams.get('id'));
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({message: 'id must be a positive integer.'}, {status: 400});
    if (!deleteClip(id)) return NextResponse.json({message: 'Clip not found.'}, {status: 404});
    return NextResponse.json({clips: listClips()});
}
