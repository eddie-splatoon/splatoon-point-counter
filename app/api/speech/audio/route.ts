import {NextRequest, NextResponse} from 'next/server';

import {findSpeech, loadVoiceSettings, synthesizeSpeech} from '../../../../lib/speech';

/**
 * 読み上げキューの 1 件を VOICEVOX で音声（wav）にして返す。
 * 任意の文を読ませないよう、キューにある id だけを受け付ける
 */
export async function GET(request: NextRequest) {
    const id = Number(request.nextUrl.searchParams.get('id'));
    const item = Number.isInteger(id) ? findSpeech(id) : undefined;
    if (!item) return NextResponse.json({message: 'Speech not found.'}, {status: 404});

    const settings = loadVoiceSettings();
    const {speakerId} = settings;
    if (!settings.enabled || speakerId === null) return NextResponse.json({message: 'Speech is disabled or no speaker is selected.'}, {status: 409});

    try {
        const wav = await synthesizeSpeech(item, {...settings, speakerId});
        return new NextResponse(wav, {headers: {'Content-Type': 'audio/wav', 'Cache-Control': 'no-store'}});
    } catch (error) {
        console.error('Failed to synthesize speech with VOICEVOX:', error);
        return NextResponse.json({message: 'Failed to synthesize speech. Is VOICEVOX running?'}, {status: 502});
    }
}
