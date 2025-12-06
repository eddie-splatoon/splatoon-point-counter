import {NextResponse} from 'next/server';

// プリセットごとのメッセージリストの型
export interface MessagePreset {
    name: string;
    messages: { id: number; text: string }[];
}

export interface StreamData {
    scoreLabel: string;
    scoreValue: number;
    transitionEffect: string;
    transitionDuration: number;
    fontFamily: string;
    fontSize: number;
    messagePresets: MessagePreset[];
    activePresetName: string;
    // エフェクト機能用の新しいプロパティ
    lastEvent: {
        name: string;
        timestamp: number;
    } | null;
}

// データを一時的にインメモリで保持するストア (本番ではDBが必要です)
let streamData: StreamData = {
    scoreLabel: '現在の評価',
    scoreValue: 580,
    transitionEffect: 'fade',
    transitionDuration: 2,
    fontFamily: 'FOT-Kurokane Std',
    fontSize: 54,
    activePresetName: '通常',
    messagePresets: [
        {
            name: '通常', messages: [
                {id: 1, text: 'チャンネル登録・高評価お願いします！'},
                {id: 2, text: 'コメントや質問もお待ちしてます！'},
            ]
        },
        {
            name: '大会', messages: [
                {id: 1, text: 'チャンネル登録・高評価お願いします！'},
                {id: 2, text: '大会参加中！応援してね！'},
            ]
        },
        {name: 'ビッグラン', messages: [{id: 1, text: 'チャンネル登録・高評価お願いします！'},]},
        {name: 'バチコン', messages: [{id: 1, text: 'チャンネル登録・高評価お願いします！'},]},
        {name: 'その他', messages: [{id: 1, text: 'チャンネル登録・高評価お願いします！'},]},
    ],
    lastEvent: null, // 初期値はnull
};

export async function GET() {
    return NextResponse.json(streamData);
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const {
            scoreLabel,
            scoreValue,
            transitionEffect,
            transitionDuration,
            fontFamily,
            fontSize,
            messagePresets,
            activePresetName,
            lastEvent, // lastEventを受け取る
        } = body;

        // データ検証
        if (typeof scoreLabel !== 'string' || typeof scoreValue !== 'number' || typeof transitionDuration !== 'number' || typeof fontFamily !== 'string' || typeof fontSize !== 'number' || typeof activePresetName !== 'string' || !Array.isArray(messagePresets)) {
            return NextResponse.json({message: 'Invalid data format.'}, {status: 400});
        }

        // データを更新
        streamData = {
            scoreLabel: scoreLabel ?? streamData.scoreLabel,
            scoreValue: scoreValue ?? streamData.scoreValue,
            transitionEffect: transitionEffect ?? streamData.transitionEffect,
            transitionDuration: transitionDuration ?? streamData.transitionDuration,
            fontFamily: fontFamily ?? streamData.fontFamily,
            fontSize: fontSize ?? streamData.fontSize,
            messagePresets: messagePresets ?? streamData.messagePresets,
            activePresetName: activePresetName ?? streamData.activePresetName,
            // lastEventがbodyに含まれていれば更新、そうでなければ元の値を維持
            lastEvent: 'lastEvent' in body ? lastEvent : streamData.lastEvent,
        };

        return NextResponse.json(streamData);
    } catch (error) {
        return NextResponse.json({message: 'Internal Server Error'}, {status: 500});
    }
}