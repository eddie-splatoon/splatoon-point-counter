// サイドパネル（配信画面右側）の型と定数。クライアントからも使うため DB に依存させない

// 下段スロットに表示できるもの。お題（challenges）・スケジュール（schedule）は各 Issue で追加する
export const SIDE_PANEL_SLOTS = ['salmon', 'burndown'] as const;

export type SidePanelSlot = typeof SIDE_PANEL_SLOTS[number];

export const SIDE_PANEL_SLOT_LABELS: Record<SidePanelSlot, string> = {
    salmon: 'サーモンラン',
    burndown: 'バーンダウン',
};

export const MIN_ROTATE_SECONDS = 5;
export const MAX_ROTATE_SECONDS = 600;

export interface SidePanelSettings {
    activeSlot: SidePanelSlot; // 自動ローテーションが OFF のときに表示するスロット
    autoRotate: boolean;
    rotateSeconds: number;
    enabledSlots: SidePanelSlot[]; // 自動ローテーションで順に表示するスロット
}

export const getDefaultSidePanelSettings = (): SidePanelSettings => ({
    activeSlot: 'salmon',
    autoRotate: false,
    rotateSeconds: 30,
    enabledSlots: [...SIDE_PANEL_SLOTS],
});

const isSlot = (value: unknown): value is SidePanelSlot =>
    typeof value === 'string' && (SIDE_PANEL_SLOTS as readonly string[]).includes(value);

/** 設定を検証する。不正ならエラーメッセージを返す */
export function parseSidePanelSettings(body: unknown): SidePanelSettings | string {
    const {activeSlot, autoRotate, rotateSeconds, enabledSlots} = (body ?? {}) as Record<string, unknown>;
    if (!isSlot(activeSlot)) return `activeSlot must be one of ${SIDE_PANEL_SLOTS.join(', ')}.`;
    if (typeof autoRotate !== 'boolean') return 'autoRotate must be a boolean.';
    if (typeof rotateSeconds !== 'number' || !Number.isInteger(rotateSeconds) || rotateSeconds < MIN_ROTATE_SECONDS || rotateSeconds > MAX_ROTATE_SECONDS) {
        return `rotateSeconds must be an integer between ${MIN_ROTATE_SECONDS} and ${MAX_ROTATE_SECONDS}.`;
    }
    if (!Array.isArray(enabledSlots) || enabledSlots.length === 0 || !enabledSlots.every(isSlot)) {
        return 'enabledSlots must be a non-empty array of slots.';
    }
    // 表示順は SIDE_PANEL_SLOTS の順にそろえ、重複を除く
    const slots = SIDE_PANEL_SLOTS.filter((slot) => enabledSlots.includes(slot));
    return {activeSlot, autoRotate, rotateSeconds, enabledSlots: slots};
}

/** いま表示するスロット。自動ローテーション中は enabledSlots を rotationIndex 番目から順に回す */
export const pickSlot = (settings: SidePanelSettings, rotationIndex: number): SidePanelSlot =>
    settings.autoRotate ? settings.enabledSlots[rotationIndex % settings.enabledSlots.length] : settings.activeSlot;
