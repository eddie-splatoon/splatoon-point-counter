import {NextResponse} from 'next/server';

// 保持する字幕行の最大数
export const MAX_CAPTION_LINES = 5;
// 1行あたりの最大文字数（超過分は切り詰める）
export const MAX_CAPTION_LENGTH = 200;

export interface CaptionLine {
    id: number;
    text: string;
    timestamp: number;
}

export interface CaptionData {
    lines: CaptionLine[];
    revision: number; // For forcing re-renders in clients
}

// 字幕データをインメモリで保持するストア
export const getInitialCaptionData = (): CaptionData => ({
    lines: [],
    revision: 0,
});

let captionData: CaptionData = getInitialCaptionData();

/**
 * **FOR TESTING PURPOSES ONLY**
 * Overwrites the current in-memory captionData object.
 * @param data The data to set.
 */
export function __TEST_ONLY_setCaptionData(data: CaptionData) {
    captionData = data;
}

export async function GET() {
    return NextResponse.json(captionData);
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

    const text = (body as {text?: unknown} | null)?.text;
    if (typeof text !== 'string' || text.trim() === '') {
        return NextResponse.json({message: 'text must be a non-empty string.'}, {status: 400});
    }

    const revision = captionData.revision + 1;
    captionData = {
        lines: [...captionData.lines, {id: revision, text: text.trim().slice(0, MAX_CAPTION_LENGTH), timestamp: Date.now()}].slice(-MAX_CAPTION_LINES),
        revision,
    };

    return NextResponse.json(captionData);
}

export async function DELETE() {
    captionData = {lines: [], revision: captionData.revision + 1};
    return NextResponse.json(captionData);
}
