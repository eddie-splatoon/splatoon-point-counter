import {NextResponse} from 'next/server';

import {endBreak, getBreakState, heardVoice, startBreak} from '../../../lib/break';
import {isBreakAction} from '../../../lib/breakTypes';

/** 休憩の状態（オーバーレイ・コントロールパネルがポーリングする） */
export async function GET() {
    return NextResponse.json(getBreakState());
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

/**
 * `{action: 'start' | 'end'}` で休憩を始める・終わる（コントロールパネルから）。
 * `{action: 'heard', resume}` は文字起こしスクリプトが配信者の声を拾うたびに送る。
 * 休憩中でなければ何もしない。resume（「ただいま」などの合言葉）なら休憩を終わり、そうでなければ解除忘れを知らせる
 */
export async function POST(request: Request) {
    const json = await readJson(request);
    if (json instanceof NextResponse) return json;
    const {action, resume = false} = (json.body ?? {}) as Record<string, unknown>;
    if (!isBreakAction(action)) {
        return NextResponse.json({message: "action must be 'start', 'end' or 'heard'."}, {status: 400});
    }
    if (action === 'start') return NextResponse.json(startBreak());
    if (action === 'end') return NextResponse.json(endBreak());
    if (typeof resume !== 'boolean') return NextResponse.json({message: 'resume must be a boolean.'}, {status: 400});
    const {result, state} = heardVoice(resume);
    return NextResponse.json({...state, result});
}
