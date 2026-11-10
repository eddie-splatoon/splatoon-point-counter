import {NextResponse} from 'next/server';

import {parseId} from '../../../../lib/salmon';
import {getSessionReview} from '../../../../lib/salmonReview';

/** 配信の最後に出す振り返り。?sessionId= で過去のセッション（省略すると今のセッション） */
export async function GET(request: Request) {
    const param = new URL(request.url).searchParams.get('sessionId');
    if (param === null) return NextResponse.json(getSessionReview());

    const sessionId = parseId(param);
    if (sessionId === null) return NextResponse.json({message: 'sessionId must be a positive integer.'}, {status: 400});
    const review = getSessionReview(sessionId);
    if (!review) return NextResponse.json({message: 'Session not found.'}, {status: 404});
    return NextResponse.json(review);
}
