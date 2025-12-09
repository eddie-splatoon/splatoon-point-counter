import {NextResponse} from 'next/server';

// プリセットごとのメッセージリストの型
export interface MessagePreset {
    name: string;
    messages: { id: number; text: string }[];
}

// バーンダウンチャート用のデータ型
export interface BurndownData {
    label: string;
    targetValue: number;
    entries: number[]; // ポイントの履歴
}

export interface StreamData {
    scoreLabel: string;
    scoreValue: string;
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
    burndown: BurndownData; // バーンダウンチャートのデータを追加
}

// データを一時的にインメモリで保持するストア (本番ではDBが必要です)
let streamData: StreamData = {
    scoreLabel: '現在の評価',
    scoreValue: '400+',
    transitionEffect: 'fade',
    transitionDuration: 2,
    fontFamily: 'FOT-Kurokane Std',
    fontSize: 54,
    activePresetName: '通常',
    messagePresets: [
        {
            name: '通常', messages: [
                {id: 1, text: 'チャンネル登録・高評価お願いします！'},
                {id: 2, text: '応援のコメントお待ちしてます！'},
            ]
        },
        {
            name: '大会', messages: [
                {id: 1, text: 'チャンネル登録・高評価お願いします！'},
                {id: 2, text: '大会参加中！応援してね！'},
            ]
        },
        {
            name: 'ビッグラン', messages: [
                {id: 1, text: 'チャンネル登録・高評価お願いします！'},
                {id: 2, text: 'ハイスコア出せるWAVE引きたい'},
                {id: 3, text: '応援のコメントお待ちしてます！'},
            ]
        },
        {name: 'バチコン', messages: [{id: 1, text: 'チャンネル登録・高評価お願いします！'},]},
        {name: 'その他', messages: [{id: 1, text: 'チャンネル登録・高評価お願いします！'},]},
    ],
    lastEvent: null, // 初期値はnull
    burndown: {
        label: '目標まであと',
        targetValue: 50000,
        entries: [],
    },
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
            burndown, // burndownを受け取る
        } = body;

        // データ検証（簡易版）
        if (typeof scoreLabel !== 'string' || typeof scoreValue !== 'string' || typeof transitionDuration !== 'number' || typeof fontFamily !== 'string' || typeof fontSize !== 'number' || typeof activePresetName !== 'string' || !Array.isArray(messagePresets)) {
            return NextResponse.json({message: 'Invalid data format for core data.'}, {status: 400});
        }
        if (burndown) {
            if (typeof burndown.label !== 'string' || typeof burndown.targetValue !== 'number' || !Array.isArray(burndown.entries)) {
                return NextResponse.json({message: 'Invalid data format for burndown data.'}, {status: 400});
            }
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
            burndown: burndown ?? streamData.burndown,
        };

        return NextResponse.json(streamData);
    } catch (error) {
        return NextResponse.json({message: 'Internal Server Error'}, {status: 500});
    }
}