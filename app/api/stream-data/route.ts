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
    // 新しいデータ構造
    messagePresets: MessagePreset[];
    activePresetName: string;
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
        {
            name: 'ビッグラン', messages: [
                {id: 1, text: 'チャンネル登録・高評価お願いします！'},

            ]
        },
        {
            name: 'バチコン', messages: [
                {id: 1, text: 'チャンネル登録・高評価お願いします！'},

            ]
        },
        {
            name: 'その他', messages: [
                {id: 1, text: 'チャンネル登録・高評価お願いします！'},

            ]
        },
    ]
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
            messagePresets, // 更新されたデータ
            activePresetName, // 更新されたデータ
        } = body;

        // データ検証を強化
        if (typeof scoreLabel !== 'string' || typeof scoreValue !== 'number' || typeof transitionDuration !== 'number' || typeof fontFamily !== 'string' || typeof fontSize !== 'number' || typeof activePresetName !== 'string' || !Array.isArray(messagePresets)) {
            return NextResponse.json({message: 'Invalid data format.'}, {status: 400});
        }

        // 0のようなfalsy値を正しく扱うために、より安全な更新ロジックに変更
        streamData = {
            scoreLabel: typeof scoreLabel !== 'undefined' ? scoreLabel : streamData.scoreLabel,
            scoreValue: typeof scoreValue === 'number' ? scoreValue : streamData.scoreValue,
            transitionEffect: typeof transitionEffect !== 'undefined' ? transitionEffect : streamData.transitionEffect,
            transitionDuration: typeof transitionDuration === 'number' ? transitionDuration : streamData.transitionDuration,
            fontFamily: typeof fontFamily !== 'undefined' ? fontFamily : streamData.fontFamily,
            fontSize: typeof fontSize === 'number' ? fontSize : streamData.fontSize,
            messagePresets: Array.isArray(messagePresets) ? messagePresets : streamData.messagePresets,
            activePresetName: typeof activePresetName !== 'undefined' ? activePresetName : streamData.activePresetName,
        };

        return NextResponse.json(streamData);
    } catch (error) {
        return NextResponse.json({message: 'Internal Server Error'}, {status: 500});
    }
}