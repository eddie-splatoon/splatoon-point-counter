import {NextResponse} from 'next/server';

import {fetchSpeakers} from '../../../../lib/speech';

/** VOICEVOX の話者（キャラクター）とスタイルの一覧。VOICEVOX が起動していなければ 502 */
export async function GET() {
    try {
        return NextResponse.json(await fetchSpeakers());
    } catch (error) {
        console.error('Failed to fetch VOICEVOX speakers:', error);
        return NextResponse.json({message: 'Failed to connect to VOICEVOX. Is it running?'}, {status: 502});
    }
}
