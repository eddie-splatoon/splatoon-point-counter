import {NextResponse} from 'next/server';

import {getSalmonSchedule} from '../../../lib/salmonScheduleFetch';

/** サーモンランのスケジュール。取得に失敗したら直前に取れた値を返す */
export async function GET() {
    const schedule = await getSalmonSchedule();
    if (!schedule) return NextResponse.json({message: 'Failed to fetch the salmon run schedule.'}, {status: 502});
    return NextResponse.json(schedule);
}
