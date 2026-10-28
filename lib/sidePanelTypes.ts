// サイドパネル（配信画面右側）の型と定数。クライアントからも使うため DB に依存させない

// 下段スロットに表示できるもの（並び順は自動ローテーションの順）。スケジュール（schedule）は #59 で追加する
export const SIDE_PANEL_SLOTS = ['salmon', 'challenges', 'burndown'] as const;

export type SidePanelSlot = typeof SIDE_PANEL_SLOTS[number];

export const SIDE_PANEL_SLOT_LABELS: Record<SidePanelSlot, string> = {
    salmon: 'サーモンラン',
    challenges: '本日のお題',
    burndown: 'バーンダウン',
};

export const MIN_ROTATE_SECONDS = 5;
export const MAX_ROTATE_SECONDS = 600;
export const MAX_FOLLOWER_GOAL = 1_000_000;
export const MAX_CHALLENGES = 8;
export const MAX_CHALLENGE_LENGTH = 40;

export interface Challenge {
    id: number;
    text: string;
    done: boolean;
}

export interface SidePanelSettings {
    activeSlot: SidePanelSlot; // 自動ローテーションが OFF のときに表示するスロット
    autoRotate: boolean;
    rotateSeconds: number;
    enabledSlots: SidePanelSlot[]; // 自動ローテーションで順に表示するスロット
    followerGoal: number | null; // 手入力のフォロワー目標。Twitch のフォロワー目標が無いときに使う
    challenges: Challenge[]; // 本日のお題（表示順）
}

export const getDefaultSidePanelSettings = (): SidePanelSettings => ({
    activeSlot: 'salmon',
    autoRotate: false,
    rotateSeconds: 30,
    enabledSlots: [...SIDE_PANEL_SLOTS],
    followerGoal: null,
    challenges: [],
});

const isSlot = (value: unknown): value is SidePanelSlot =>
    typeof value === 'string' && (SIDE_PANEL_SLOTS as readonly string[]).includes(value);

/** 設定を検証する。不正ならエラーメッセージを返す */
export function parseSidePanelSettings(body: unknown): SidePanelSettings | string {
    const {activeSlot, autoRotate, rotateSeconds, enabledSlots, followerGoal = null, challenges = []} = (body ?? {}) as Record<string, unknown>;
    if (!isSlot(activeSlot)) return `activeSlot must be one of ${SIDE_PANEL_SLOTS.join(', ')}.`;
    if (typeof autoRotate !== 'boolean') return 'autoRotate must be a boolean.';
    if (typeof rotateSeconds !== 'number' || !Number.isInteger(rotateSeconds) || rotateSeconds < MIN_ROTATE_SECONDS || rotateSeconds > MAX_ROTATE_SECONDS) {
        return `rotateSeconds must be an integer between ${MIN_ROTATE_SECONDS} and ${MAX_ROTATE_SECONDS}.`;
    }
    if (!Array.isArray(enabledSlots) || enabledSlots.length === 0 || !enabledSlots.every(isSlot)) {
        return 'enabledSlots must be a non-empty array of slots.';
    }
    // followerGoal は後から追加した項目なので、保存済みの設定に無ければ未設定（null）とみなす
    if (followerGoal !== null && (typeof followerGoal !== 'number' || !Number.isInteger(followerGoal) || followerGoal < 1 || followerGoal > MAX_FOLLOWER_GOAL)) {
        return `followerGoal must be null or an integer between 1 and ${MAX_FOLLOWER_GOAL}.`;
    }
    // challenges も後から追加した項目なので、保存済みの設定に無ければお題なしとみなす
    const parsedChallenges = parseChallenges(challenges);
    if (typeof parsedChallenges === 'string') return parsedChallenges;
    // 表示順は SIDE_PANEL_SLOTS の順にそろえ、重複を除く
    const slots = SIDE_PANEL_SLOTS.filter((slot) => enabledSlots.includes(slot));
    return {activeSlot, autoRotate, rotateSeconds, enabledSlots: slots, followerGoal, challenges: parsedChallenges};
}

function parseChallenges(value: unknown): Challenge[] | string {
    const invalid = `challenges must be an array of up to ${MAX_CHALLENGES} {id, text, done} with unique ids and 1-${MAX_CHALLENGE_LENGTH} characters of text.`;
    if (!Array.isArray(value) || value.length > MAX_CHALLENGES) return invalid;
    const challenges: Challenge[] = [];
    for (const item of value) {
        const {id, text, done} = (item ?? {}) as Record<string, unknown>;
        if (typeof id !== 'number' || !Number.isInteger(id) || id < 1 || typeof done !== 'boolean' || typeof text !== 'string') return invalid;
        const trimmed = text.trim();
        if (trimmed === '' || trimmed.length > MAX_CHALLENGE_LENGTH || challenges.some((c) => c.id === id)) return invalid;
        challenges.push({id, text: trimmed, done});
    }
    return challenges;
}

/** いま表示するスロット。自動ローテーション中は enabledSlots を rotationIndex 番目から順に回す */
export const pickSlot = (settings: SidePanelSettings, rotationIndex: number): SidePanelSlot =>
    settings.autoRotate ? settings.enabledSlots[rotationIndex % settings.enabledSlots.length] : settings.activeSlot;

export interface FollowerProgress {
    current: number;
    target: number;
}

/**
 * フォロワーゲージに出す値。Twitch のクリエイターゴール（フォロワー型）を優先し、
 * 無ければ手入力の目標とフォロワー総数を使う。どちらも無ければ null（ゲージを出さない）
 */
export function getFollowerProgress(
    twitch: {followerTotal: number | null; goal: {current: number; target: number} | null},
    followerGoal: number | null,
): FollowerProgress | null {
    if (twitch.goal) return twitch.goal;
    if (twitch.followerTotal === null || followerGoal === null) return null;
    return {current: twitch.followerTotal, target: followerGoal};
}
