import {NextResponse} from 'next/server';

import {listImports, listPendingImports, parseImportResult, requestImport, updateImport} from '../../../../lib/salmonImports';

/** 取り込みの依頼の一覧（新しい順）。`?status=pending` なら処理待ちだけ（古い順。取り込みスクリプトが使う） */
export async function GET(request: Request) {
    const pendingOnly = new URL(request.url).searchParams.get('status') === 'pending';
    return NextResponse.json({imports: pendingOnly ? listPendingImports() : listImports()});
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

/** 最新のリザルトの取り込みを依頼する。処理待ち・取り込み中の依頼があれば新しく作らずにそれを返す */
export async function POST(request: Request) {
    const json = await readJson(request);
    if (json instanceof NextResponse) return json;
    return NextResponse.json({import: requestImport()});
}

/** 取り込みの開始（processing）・結果を書き込む（取り込みスクリプトから）。succeeded ならバイトを記録する */
export async function PATCH(request: Request) {
    const json = await readJson(request);
    if (json instanceof NextResponse) return json;
    const parsed = parseImportResult(json.body);
    if (typeof parsed === 'string') return NextResponse.json({message: parsed}, {status: 400});
    const result = updateImport(parsed.id, parsed.result);
    if (result === 'notFound') return NextResponse.json({message: 'Import request in that state not found.'}, {status: 404});
    if (result === 'duplicate') return NextResponse.json({message: 'This job has already been imported.'}, {status: 409});
    return NextResponse.json({import: result});
}
