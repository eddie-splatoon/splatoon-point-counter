// サイドパネル（配信画面右側）の型と定数。クライアントからも使うため DB に依存させない

// 下段スロットに表示できるもの（並び順は、縦に並べるときの上からの順と、自動ローテーションの順）
export const SIDE_PANEL_SLOTS = ['schedule', 'salmon', 'challenges', 'burndown'] as const;

export type SidePanelSlot = typeof SIDE_PANEL_SLOTS[number];

// 下段全体の高さを使うスロット。他のスロットと同時には表示できない
export const FULL_HEIGHT_SLOTS: readonly SidePanelSlot[] = ['burndown'];

export const SIDE_PANEL_SLOT_LABELS: Record<SidePanelSlot, string> = {
    schedule: 'スケジュール',
    salmon: '本日の戦績',
    challenges: '本日のお題',
    burndown: 'バーンダウン',
};

export const MIN_ROTATE_SECONDS = 5;
export const MAX_ROTATE_SECONDS = 600;
export const MAX_FOLLOWER_GOAL = 1_000_000;
export const MAX_CHALLENGES = 8;
export const MAX_CHALLENGE_LENGTH = 40; // 改行を除いた文字数
export const MAX_CHALLENGE_LINES = 3;

export interface Challenge {
    id: number;
    text: string;
    done: boolean;
}

export interface SidePanelSettings {
    visibleSlots: SidePanelSlot[]; // 自動ローテーションが OFF のときに上から順に表示するスロット
    autoRotate: boolean;
    rotateSeconds: number;
    enabledSlots: SidePanelSlot[]; // 自動ローテーションで順に表示するスロット
    followerGoal: number | null; // 手入力のフォロワー目標。Twitch のフォロワー目標が無いときに使う
    challenges: Challenge[]; // 本日のお題（表示順）
}

export const getDefaultSidePanelSettings = (): SidePanelSettings => ({
    visibleSlots: ['salmon'],
    autoRotate: false,
    rotateSeconds: 30,
    // お題は登録されていないと何も表示しないので、既定のローテーションには含めない（空白の時間ができないように）
    enabledSlots: ['salmon', 'burndown'],
    followerGoal: null,
    challenges: [],
});

const isSlot = (value: unknown): value is SidePanelSlot =>
    typeof value === 'string' && (SIDE_PANEL_SLOTS as readonly string[]).includes(value);

/** 設定を検証する。不正ならエラーメッセージを返す */
export function parseSidePanelSettings(body: unknown): SidePanelSettings | string {
    const {visibleSlots: savedVisibleSlots, activeSlot, autoRotate, rotateSeconds, enabledSlots, followerGoal = null, challenges = []} =
        (body ?? {}) as Record<string, unknown>;
    // visibleSlots は activeSlot（1つだけ選ぶ方式）を置き換えた項目。保存済みの設定に無ければ activeSlot から作る
    const visibleSlots = savedVisibleSlots ?? (isSlot(activeSlot) ? [activeSlot] : undefined);
    if (!Array.isArray(visibleSlots) || visibleSlots.length === 0 || !visibleSlots.every(isSlot)) {
        return `visibleSlots must be a non-empty array of ${SIDE_PANEL_SLOTS.join(', ')}.`;
    }
    const visible = SIDE_PANEL_SLOTS.filter((slot) => visibleSlots.includes(slot));
    if (visible.length > 1 && visible.some((slot) => FULL_HEIGHT_SLOTS.includes(slot))) {
        return `${FULL_HEIGHT_SLOTS.join(', ')} cannot be shown together with other slots.`;
    }
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
    return {visibleSlots: visible, autoRotate, rotateSeconds, enabledSlots: slots, followerGoal, challenges: parsedChallenges};
}

/**
 * お題の文字列を整える。改行は配信者が折り返したい位置として残し、各行の前後の空白と空行は除く。
 * 空、または行数・文字数（改行を除く）が上限を超えるなら null
 */
export function normalizeChallengeText(text: string): string | null {
    const lines = text.replace(/\r\n?/g, '\n').split('\n').map((line) => line.trim()).filter((line) => line !== '');
    const length = lines.join('').length;
    if (lines.length === 0 || lines.length > MAX_CHALLENGE_LINES || length > MAX_CHALLENGE_LENGTH) return null;
    return lines.join('\n');
}

function parseChallenges(value: unknown): Challenge[] | string {
    const invalid = `challenges must be an array of up to ${MAX_CHALLENGES} {id, text, done} with unique ids and text of 1-${MAX_CHALLENGE_LENGTH} characters in up to ${MAX_CHALLENGE_LINES} lines.`;
    if (!Array.isArray(value) || value.length > MAX_CHALLENGES) return invalid;
    const challenges: Challenge[] = [];
    for (const item of value) {
        const {id, text, done} = (item ?? {}) as Record<string, unknown>;
        if (typeof id !== 'number' || !Number.isInteger(id) || id < 1 || typeof done !== 'boolean' || typeof text !== 'string') return invalid;
        const normalized = normalizeChallengeText(text);
        if (normalized === null || challenges.some((c) => c.id === id)) return invalid;
        challenges.push({id, text: normalized, done});
    }
    return challenges;
}

/** いま表示するスロット（上から順）。自動ローテーション中は enabledSlots を rotationIndex 番目から1つずつ回す */
export const pickSlots = (settings: SidePanelSettings, rotationIndex: number): SidePanelSlot[] =>
    settings.autoRotate ? [settings.enabledSlots[rotationIndex % settings.enabledSlots.length]] : settings.visibleSlots;

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
