import {NextResponse} from 'next/server';

import {getAppState, setAppState} from '../../../lib/db';
import {enqueueSpeech} from '../../../lib/speech';
import {MAX_TELOP_LENGTH, Telop, TelopData, getDefaultTelopSettings, normalizeTelopText, parseTelopSettings} from '../../../lib/telopTypes';

const STATE_KEY = 'telop';

// いま出ているテロップはインメモリで持つ（字幕と同じく、再起動したら消えてよい）。プリセットは SQLite に保存する
let current: Telop | null = null;
let revision = 0;

/**
 * **FOR TESTING PURPOSES ONLY**
 * Resets the in-memory telop.
 */
export function __TEST_ONLY_resetTelop() {
    current = null;
    revision = 0;
}

/** 保存済みのプリセット。未保存、または不正なら既定値 */
const loadPresets = () => {
    const saved = parseTelopSettings(getAppState(STATE_KEY));
    return (typeof saved === 'string' ? getDefaultTelopSettings() : saved).presets;
};

const toData = (): TelopData => ({presets: loadPresets(), current, revision, serverTime: Date.now()});

export async function GET() {
    return NextResponse.json(toData());
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
 * テロップを出す。`{presetId}` でプリセットを、`{text, followFont?}` で自由入力の文を出す（Stream Deck などからも同じ形で送れる）。
 * 自由入力の followFont（共通設定のフォントで表示するか）は省略すると true、speak（読み上げるか）は省略すると false。
 * 読み上げるものは読み上げキューにも入れる（読み上げが無効なら入れない）
 */
export async function POST(request: Request) {
    const json = await readJson(request);
    if (json instanceof NextResponse) return json;
    const {presetId, text, followFont = true, speak = false} = (json.body ?? {}) as Record<string, unknown>;

    let telop: {text: string; followFont: boolean};
    let shouldSpeak: boolean;
    if (presetId !== undefined) {
        const preset = loadPresets().find((p) => p.id === presetId);
        if (!preset) return NextResponse.json({message: 'Preset not found.'}, {status: 404});
        telop = {text: preset.text, followFont: preset.followFont};
        shouldSpeak = preset.speak;
    } else {
        const telopText = typeof text === 'string' ? normalizeTelopText(text) : null;
        if (telopText === null || typeof followFont !== 'boolean' || typeof speak !== 'boolean') {
            return NextResponse.json({message: `Either presetId or a non-empty text of up to ${MAX_TELOP_LENGTH} characters (with optional booleans followFont and speak) is required.`}, {status: 400});
        }
        telop = {text: telopText, followFont};
        shouldSpeak = speak;
    }

    revision += 1;
    current = {id: revision, ...telop, timestamp: Date.now()};
    if (shouldSpeak) enqueueSpeech(telop.text);
    return NextResponse.json(toData());
}

/** プリセットを保存する */
export async function PUT(request: Request) {
    const json = await readJson(request);
    if (json instanceof NextResponse) return json;

    const settings = parseTelopSettings(json.body);
    if (typeof settings === 'string') return NextResponse.json({message: settings}, {status: 400});

    setAppState(STATE_KEY, settings);
    return NextResponse.json(toData());
}
