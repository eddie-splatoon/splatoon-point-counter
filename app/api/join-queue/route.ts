import {NextResponse} from 'next/server';

import {
    callNext,
    cancelJoin,
    closeQueue,
    getPanelView,
    getPublicView,
    joinQueue,
    loadHazardContext,
    openQueue,
    removeFromQueue,
    setStreamerRating,
} from '../../../lib/joinQueue';
import {JOIN_ANNOUNCEMENT_KINDS, JOIN_ARGS_MAX_LENGTH, JoinAnnouncementKind, formatJoinAnnouncement} from '../../../lib/joinQueueTypes';
import {queueChatPost} from '../../../lib/telop';

/**
 * 受付の列。既定は配信画面用（番号・表示名だけ）、`?view=panel` は配信者の手元用（評価・注記つき）。
 * ほかの API と同じく localhost で使う前提で認証は無い（評価を出さないのは配信画面の話で、API では隠していない）
 */
export async function GET(request: Request) {
    const panel = new URL(request.url).searchParams.get('view') === 'panel';
    const context = loadHazardContext();
    return NextResponse.json(panel ? getPanelView(context) : getPublicView(context));
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

// Twitch の ID は数字、message_id は UUID。長さだけ抑える（画面には出さない）
const isId = (value: unknown, max: number): value is string => typeof value === 'string' && value !== '' && value.length <= max;
const isText = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max;
const badRequest = (message: string) => NextResponse.json({message}, {status: 400});

/**
 * - `{action: 'join', userId, userName, messageId, args}` / `{action: 'cancel', userId}`: Twitch 連携スクリプトから（チャットの !参加 / !取消）。
 *   応答の reply を返信する
 * - `{action: 'next' | 'open' | 'close'}` / `{action: 'remove', userId}`: コントロールパネルから
 * - `{action: 'streamer', rating: string | null}`: 配信者の評価を手元で入れる（null で取り込んだ記録に戻す）
 * - `{action: 'announce', kind: 'merge' | 'private'}`: 通常のバイトへの合流・プライベートバイトのお知らせを、
 *   テロップのコメントと同じ書き込み待ちに入れる（チャットに書き込んで読み上げる。書き込めなければ読み上げだけ）
 */
export async function POST(request: Request) {
    const json = await readJson(request);
    if (json instanceof NextResponse) return json;
    const body = (json.body ?? {}) as Record<string, unknown>;
    const panelView = () => NextResponse.json(getPanelView(loadHazardContext()));
    switch (body.action) {
        case 'join': {
            const {userId, userName, messageId, args, attached = false} = body;
            if (!isId(userId, 64) || !isText(userName, 100) || !isId(messageId, 100) || !isText(args, 200) || typeof attached !== 'boolean') {
                return badRequest('userId, userName, messageId and args are required.');
            }
            return NextResponse.json(joinQueue({userId, userName, messageId, args, attached}));
        }
        case 'cancel':
            if (!isId(body.userId, 64)) return badRequest('userId is required.');
            return NextResponse.json(cancelJoin(body.userId));
        case 'remove':
            if (!isId(body.userId, 64)) return badRequest('userId is required.');
            if (!removeFromQueue(body.userId)) return NextResponse.json({message: 'Not in the queue.'}, {status: 404});
            return panelView();
        case 'next':
            callNext();
            return panelView();
        case 'open':
            openQueue();
            return panelView();
        case 'close':
            closeQueue();
            return panelView();
        case 'streamer': {
            const {rating} = body;
            if (rating !== null && !isText(rating, JOIN_ARGS_MAX_LENGTH)) return badRequest(`rating must be a string up to ${JOIN_ARGS_MAX_LENGTH} characters or null.`);
            if (!setStreamerRating(rating)) return badRequest('rating is not readable (e.g. でんせつ820).');
            return panelView();
        }
        case 'announce': {
            if (!(JOIN_ANNOUNCEMENT_KINDS as readonly unknown[]).includes(body.kind)) return badRequest("kind must be 'merge' or 'private'.");
            const view = getPanelView(loadHazardContext());
            queueChatPost(formatJoinAnnouncement(body.kind as JoinAnnouncementKind, view.recommended?.normal ?? null), true);
            return NextResponse.json(view);
        }
        default:
            return badRequest("action must be one of 'join', 'cancel', 'remove', 'next', 'open', 'close', 'streamer' or 'announce'.");
    }
}
