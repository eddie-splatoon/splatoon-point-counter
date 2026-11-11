import {NextResponse} from 'next/server';

import {getScoreDisplay, updateScoreDisplay} from '../../../lib/scoreDisplay';
import {parseScoreDisplayUpdate} from '../../../lib/scoreDisplayTypes';

/** スコア表示（ラベル・値）と、リザルトの取り込みで自動更新するかの設定 */
export async function GET() {
    return NextResponse.json(getScoreDisplay());
}

/** 送った項目だけを書き換える（コントロールパネルのスコア表示タブから） */
export async function PATCH(request: Request) {
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
    const update = parseScoreDisplayUpdate(body);
    if (typeof update === 'string') return NextResponse.json({message: update}, {status: 400});
    return NextResponse.json(updateScoreDisplay(update));
}
