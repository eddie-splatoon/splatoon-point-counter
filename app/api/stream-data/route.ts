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
    entries: {score: number; timestamp: number}[]; // ポイントの履歴
}

export interface StreamData {
    scoreLabel: string;
    scoreValue: string;
    transitionEffect: 'fade' | 'slide';
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
    revision: number; // For forcing re-renders in clients
}

// オーバーレイが表示できるエフェクト（lastEvent.name）
export const EFFECT_NAMES = ['LOVE', 'STAR', 'SPARKLE', 'BUBBLE'] as const;

// データを一時的にインメモリで保持するストア (本番ではDBが必要です)
export const getInitialStreamData = (): StreamData => ({
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
    revision: 0, // Initialize revision
});

let streamData: StreamData = getInitialStreamData();

/**
 * **FOR TESTING PURPOSES ONLY**
 * Overwrites the current in-memory streamData object.
 * @param data The data to set.
 */
export function __TEST_ONLY_setStreamData(data: StreamData) {
    streamData = data;
}

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
            for (const entry of burndown.entries) {
                if (typeof entry.score !== 'number' || typeof entry.timestamp !== 'number') {
                    return NextResponse.json({message: 'Invalid data format for burndown entry.'}, {status: 400});
                }
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
            revision: streamData.revision + 1, // Increment revision on every update
        };

        return NextResponse.json(streamData);
    } catch {
        return NextResponse.json({message: 'Internal Server Error'}, {status: 500});
    }
}

/**
 * エフェクトだけを出す（`{event: 'STAR'}` など）。文字起こしスクリプト（tools/caption-stt）が話した言葉に合わせて呼ぶ。
 * POST と違ってほかの項目を送らなくてよいので、コントロールパネルの入力内容を上書きしない
 */
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
    const event = (body as {event?: unknown} | null)?.event;
    if (!EFFECT_NAMES.some((name) => name === event)) {
        return NextResponse.json({message: `event must be one of ${EFFECT_NAMES.join(', ')}.`}, {status: 400});
    }

    streamData = {...streamData, lastEvent: {name: event as string, timestamp: Date.now()}, revision: streamData.revision + 1};
    return NextResponse.json(streamData);
}
