import {NextResponse} from 'next/server';

import {getRecordedJobs, listImports, listPendingImports, parseImportResult, requestImport, updateImport} from '../../../../lib/salmonImports';
import {updateScoreDisplayFromImport} from '../../../../lib/scoreDisplay';

/**
 * 取り込みの依頼の一覧（新しい順）。取り込みスクリプトは次を使う
 * - `?status=pending`: 処理待ちの依頼だけ（古い順）
 * - `?view=recorded`: 記録済みのバイトの日時と今のセッションの開始時刻（取りこぼしをどこまで遡るか決めるため）
 */
export async function GET(request: Request) {
    const params = new URL(request.url).searchParams;
    if (params.get('view') === 'recorded') return NextResponse.json(getRecordedJobs());
    return NextResponse.json({imports: params.get('status') === 'pending' ? listPendingImports() : listImports()});
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

/**
 * 取り込みの開始（processing）・結果を書き込む（取り込みスクリプトから）。succeeded なら記録していないバイトを古い順に記録し、
 * 最新のバイトに合わせてスコア表示（バイト評価・ハイスコア）を書き換える
 */
export async function PATCH(request: Request) {
    const json = await readJson(request);
    if (json instanceof NextResponse) return json;
    const parsed = parseImportResult(json.body);
    if (typeof parsed === 'string') return NextResponse.json({message: parsed}, {status: 400});
    const result = updateImport(parsed.id, parsed.result);
    if (result === 'notFound') return NextResponse.json({message: 'Import request in that state not found.'}, {status: 404});
    if (result === 'duplicate') return NextResponse.json({message: 'All jobs have already been recorded.'}, {status: 409});
    if (parsed.result.status === 'succeeded') {
        // スコア表示の更新は記録のおまけなので、失敗しても取り込みは成功として返す
        try {
            await updateScoreDisplayFromImport(parsed.result.jobs);
        } catch (error) {
            console.error('Failed to update the score display from the imported job:', error);
        }
    }
    return NextResponse.json({import: result});
}
