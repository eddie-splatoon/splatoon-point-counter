import {NextResponse} from 'next/server';

import {setAppState} from '../../../lib/db';
import {getScoreDisplay, updateScoreDisplay} from '../../../lib/scoreDisplay';
import {DEFAULT_SCORE_DISPLAY} from '../../../lib/scoreDisplayTypes';
import {
    getStreamSettings,
    hasStoredStreamSettings,
    updateStreamSettings,
    STREAM_SETTINGS_STATE_KEY,
} from '../../../lib/streamSettings';
import {DEFAULT_STREAM_SETTINGS, StreamSettings, parseStreamSettingsUpdate} from '../../../lib/streamSettingsTypes';

export type {BurndownData, MessagePreset} from '../../../lib/streamSettingsTypes';

export interface StreamData extends StreamSettings {
    // スコア表示は lib/scoreDisplay.ts で SQLite に別に保存している（リザルトの取り込みで自動で書き換えるため）。GET で合わせて返す
    scoreLabel: string;
    scoreValue: string;
    // エフェクト。出したときだけのものなのでメモリだけに持つ
    lastEvent: {
        name: string;
        timestamp: number;
    } | null;
    revision: number; // For forcing re-renders in clients
    // 設定が SQLite に保存済みか（コントロールパネルが、以前の localStorage の設定を 1 回だけ移すときに使う）
    settingsStored: boolean;
}

// オーバーレイが表示できるエフェクト（lastEvent.name）
export const EFFECT_NAMES = ['LOVE', 'STAR', 'SPARKLE', 'BUBBLE'] as const;
// PATCH {event} で出せるもの。FIREWORKS はバーンダウンのオーバーレイが目標の達成で出す
const EVENT_NAMES = [...EFFECT_NAMES, 'FIREWORKS'] as const;

export const getInitialStreamData = (): StreamData => ({
    ...DEFAULT_STREAM_SETTINGS,
    scoreLabel: DEFAULT_SCORE_DISPLAY.scoreLabel,
    scoreValue: DEFAULT_SCORE_DISPLAY.scoreValue,
    lastEvent: null,
    revision: 0,
    settingsStored: false,
});

let lastEvent: StreamData['lastEvent'] = null;
let revision = 0;

/**
 * **FOR TESTING PURPOSES ONLY**
 * Overwrites the current stream data (settings in SQLite, the score display and the in-memory event).
 * @param data The data to set.
 */
export function __TEST_ONLY_setStreamData(data: StreamData) {
    const {scoreLabel, scoreValue, lastEvent: event, revision: rev, settingsStored, ...settings} = data;
    if (settingsStored) updateStreamSettings(settings);
    else setAppState(STREAM_SETTINGS_STATE_KEY, null);
    updateScoreDisplay({scoreLabel, scoreValue});
    lastEvent = event;
    revision = rev;
}

const currentStreamData = (): StreamData => {
    const {scoreLabel, scoreValue} = getScoreDisplay();
    return {...getStreamSettings(), scoreLabel, scoreValue, lastEvent, revision, settingsStored: hasStoredStreamSettings()};
};

export async function GET() {
    return NextResponse.json(currentStreamData());
}

/**
 * 設定を保存する。送った項目だけを書き換える（コントロールパネルが、変わった項目だけをその場で送る）。
 * スコア表示は /api/score-display、エフェクトは PATCH で別に送る
 */
export async function POST(request: Request) {
    // 他サイトからプリフライトなしで送れる text/plain などの「単純リクエスト」を拒否する（設定は SQLite に残るので書き換えさせない）
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
        return NextResponse.json({message: 'Content-Type must be application/json.'}, {status: 415});
    }
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({message: 'Invalid JSON.'}, {status: 400});
    }
    const result = parseStreamSettingsUpdate(body);
    if (!result.ok) return NextResponse.json({message: result.message}, {status: 400});

    updateStreamSettings(result.update);
    revision += 1;
    return NextResponse.json(currentStreamData());
}

/**
 * エフェクトだけを出す（`{event: 'STAR'}` など）。コントロールパネルのボタン・文字起こしスクリプト（tools/caption-stt）・
 * バーンダウンのオーバーレイ（目標の達成で FIREWORKS）が呼ぶ。設定は変えない
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
    if (!EVENT_NAMES.some((name) => name === event)) {
        return NextResponse.json({message: `event must be one of ${EVENT_NAMES.join(', ')}.`}, {status: 400});
    }

    lastEvent = {name: event as string, timestamp: Date.now()};
    revision += 1;
    return NextResponse.json(currentStreamData());
}
