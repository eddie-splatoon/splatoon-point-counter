import {NextResponse} from 'next/server';

export interface TwitchGoal {
    current: number;
    target: number;
}

export interface TwitchData {
    followerTotal: number | null; // null: tools/twitch-eventsub から未受信
    goal: TwitchGoal | null; // Twitch のクリエイターゴール（フォロワー型）。未設定なら null
    lastFollowAt: number | null; // 最後にフォローを受信した時刻（フォロワー名は保持しない）
    updatedAt: number | null;
    revision: number; // For forcing re-renders in clients
}

// Twitch のデータをインメモリで保持するストア
export const getInitialTwitchData = (): TwitchData => ({
    followerTotal: null,
    goal: null,
    lastFollowAt: null,
    updatedAt: null,
    revision: 0,
});

let twitchData: TwitchData = getInitialTwitchData();

/**
 * **FOR TESTING PURPOSES ONLY**
 * Overwrites the current in-memory twitchData object.
 * @param data The data to set.
 */
export function __TEST_ONLY_setTwitchData(data: TwitchData) {
    twitchData = data;
}

const isNonNegativeInteger = (value: unknown): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value >= 0;

const isValidGoal = (goal: unknown): goal is TwitchGoal | null => {
    if (goal === null) return true;
    if (typeof goal !== 'object') return false;
    const {current, target} = goal as {current?: unknown; target?: unknown};
    return isNonNegativeInteger(current) && isNonNegativeInteger(target) && target > 0;
};

export async function GET() {
    return NextResponse.json(twitchData);
}

export async function POST(request: Request) {
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

    const {followerTotal, goal, lastFollowAt} = (body ?? {}) as {followerTotal?: unknown; goal?: unknown; lastFollowAt?: unknown};
    if (!isNonNegativeInteger(followerTotal)) {
        return NextResponse.json({message: 'followerTotal must be a non-negative integer.'}, {status: 400});
    }
    if (!isValidGoal(goal)) {
        return NextResponse.json({message: 'goal must be null or {current, target} with target > 0.'}, {status: 400});
    }
    if (lastFollowAt !== null && !isNonNegativeInteger(lastFollowAt)) {
        return NextResponse.json({message: 'lastFollowAt must be null or a timestamp.'}, {status: 400});
    }

    twitchData = {
        followerTotal,
        goal: goal === null ? null : {current: goal.current, target: goal.target},
        lastFollowAt,
        updatedAt: Date.now(),
        revision: twitchData.revision + 1,
    };

    return NextResponse.json(twitchData);
}
