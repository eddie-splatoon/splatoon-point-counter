'use client';

import {useEffect} from 'react';

import {TELOP_SHORTCUT_KEYS, TelopPreset} from '../lib/telopTypes';

// 入力欄で数字を打っているときや、プルダウン（MUI の Select はフォーカスが div[role=combobox] やメニューの項目に乗る）を
// キーボードで操作しているときは、ショートカットとして扱わない
export const isEditableTarget = (target: EventTarget | null) =>
    target instanceof HTMLElement && (
        target.isContentEditable
        || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
        || target.closest('[role="combobox"], [role="listbox"], [role="option"]') !== null
    );

/**
 * キーボードの 1〜9, 0 で、並び順のプリセット（先頭の 10 個）を出す。コントロールパネルの共通の外枠で 1 回だけ使い、
 * どの画面を開いていても効くようにする（IME 変換中・修飾キー付き・キーリピートは無視）
 */
export function useTelopHotkeys(presets: TelopPreset[] | null, show: (presetId: number) => void) {
    useEffect(() => {
        if (!presets) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.isComposing || e.repeat || e.ctrlKey || e.metaKey || e.altKey || isEditableTarget(e.target)) return;
            const index = (TELOP_SHORTCUT_KEYS as readonly string[]).indexOf(e.key);
            const preset = index >= 0 ? presets[index] : undefined;
            if (!preset) return;
            e.preventDefault();
            show(preset.id);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [presets, show]);
}
