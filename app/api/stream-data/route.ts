import { NextResponse } from 'next/server';

export interface StreamData {
    scoreLabel: string;
    scoreValue: number;
    messages: { id: number; text: string }[];
    transitionEffect: string;
    transitionDuration: number;
}

// データを一時的にインメモリで保持するストア (本番ではDBが必要です)
let streamData: StreamData = {
    scoreLabel: 'ハイスコア',
    scoreValue: 580,
    messages: [
        { id: 1, text: '大会参加中！応援してね！' },
        { id: 2, text: 'チャンネル登録・高評価お願いします' },
    ],
    transitionEffect: 'fade',
    transitionDuration: 5,
};

export async function GET() {
    console.log('API Route (GET): Sending data to obs-overlay ->', streamData);
    return NextResponse.json(streamData);
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        console.log('API Route (POST): Received data from control-panel ->', body);
        const { scoreLabel, scoreValue, messages, transitionEffect, transitionDuration } = body;

        if (typeof scoreLabel !== 'string' || typeof scoreValue !== 'number' || typeof transitionDuration !== 'number') {
            return NextResponse.json({ message: 'Invalid data format.' }, { status: 400 });
        }

        streamData = {
            scoreLabel: scoreLabel,
            scoreValue: scoreValue,
            messages: Array.isArray(messages) ? messages : streamData.messages,
            transitionEffect: transitionEffect || streamData.transitionEffect,
            transitionDuration: transitionDuration || streamData.transitionDuration,
        };

        return NextResponse.json(streamData);
    } catch (error) {
        return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
    }
}