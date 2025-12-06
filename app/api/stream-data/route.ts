import {NextResponse} from 'next/server';

export interface StreamData {
    scoreLabel: string;
    scoreValue: number;
    messages: { id: number; text: string }[];
    transitionEffect: string;
    transitionDuration: number;
    fontFamily: string;
    fontSize: number;
}

// データを一時的にインメモリで保持するストア (本番ではDBが必要です)
let streamData: StreamData = {
    scoreLabel: '現在の評価',
    scoreValue: 580,
    messages: [
        {id: 1, text: 'チャンネル登録・高評価お願いします！'},
        {id: 2, text: '大会参加中！応援してね！'},
    ],
    transitionEffect: 'fade',
    transitionDuration: 2,
    fontFamily: 'FOT-Kurokane Std',
    fontSize: 54,
};

export async function GET() {
    return NextResponse.json(streamData);
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const {scoreLabel, scoreValue, messages, transitionEffect, transitionDuration, fontFamily, fontSize} = body;

        // データ検証を強化
        if (typeof scoreLabel !== 'string' || typeof scoreValue !== 'number' || typeof transitionDuration !== 'number' || typeof fontFamily !== 'string' || typeof fontSize !== 'number') {
            return NextResponse.json({message: 'Invalid data format.'}, {status: 400});
        }

        // 0のようなfalsy値を正しく扱うために、より安全な更新ロジックに変更
        streamData = {
            scoreLabel: typeof scoreLabel !== 'undefined' ? scoreLabel : streamData.scoreLabel,
            scoreValue: typeof scoreValue === 'number' ? scoreValue : streamData.scoreValue,
            messages: Array.isArray(messages) ? messages : streamData.messages,
            transitionEffect: typeof transitionEffect !== 'undefined' ? transitionEffect : streamData.transitionEffect,
            transitionDuration: typeof transitionDuration === 'number' ? transitionDuration : streamData.transitionDuration,
            fontFamily: typeof fontFamily !== 'undefined' ? fontFamily : streamData.fontFamily,
            fontSize: typeof fontSize === 'number' ? fontSize : streamData.fontSize,
        };

        return NextResponse.json(streamData);
    } catch (error) {
        return NextResponse.json({message: 'Internal Server Error'}, {status: 500});
    }
}