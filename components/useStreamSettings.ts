'use client';

import axios from 'axios';
import {useCallback, useEffect, useRef, useState} from 'react';

import {StreamData} from '../app/api/stream-data/route';
import {getItem, removeItem} from '../lib/localStorage';
import {STREAM_SETTINGS_KEYS, StreamSettings, isValidStreamSetting} from '../lib/streamSettingsTypes';

import {useSaveStatus} from './controlPanelContext';

// 以前はコントロールパネルの設定を localStorage のこのキーに入れていた。残っていれば 1 回だけサーバーに移して消す
export const LEGACY_LOCAL_STORAGE_KEY = 'control-panel-state';
// 入力が止まってから保存するまでの時間
export const SAVE_DELAY_MS = 500;
// fetch の keepalive で送れる本文の大きさ（ブラウザの上限 64KiB より少し小さく）
const KEEPALIVE_MAX_BYTES = 60_000;

const pickSettings = (data: StreamSettings): StreamSettings =>
    Object.fromEntries(STREAM_SETTINGS_KEYS.map((key) => [key, data[key]])) as unknown as StreamSettings;

/** 保存済みの値と比べて変わった項目のうち、送れる値のものだけ（入力途中の不正な値は送らない） */
const changedSettings = (current: StreamSettings, saved: StreamSettings): Partial<StreamSettings> =>
    Object.fromEntries(STREAM_SETTINGS_KEYS
        .filter((key) => JSON.stringify(current[key]) !== JSON.stringify(saved[key]) && isValidStreamSetting(key, current[key]))
        .map((key) => [key, current[key]]));

/** 以前 localStorage に入れていた設定のうち、形が正しいものだけ */
const readLegacySettings = (): Partial<StreamSettings> => {
    let stored: unknown;
    try {
        stored = getItem<unknown>(LEGACY_LOCAL_STORAGE_KEY);
    } catch {
        // 壊れていたら捨てる
        removeItem(LEGACY_LOCAL_STORAGE_KEY);
        return {};
    }
    if (typeof stored !== 'object' || stored === null) return {};
    const record = stored as Record<string, unknown>;
    return Object.fromEntries(STREAM_SETTINGS_KEYS
        .filter((key) => key in record && isValidStreamSetting(key, record[key]))
        .map((key) => [key, record[key]]));
};

export interface StreamSettingsState {
    /** 読み込み前は null */
    settings: StreamSettings | null;
    loadError: boolean;
    /** 変えると、少し待ってから変わった項目だけを保存する */
    update: (delta: Partial<StreamSettings>) => void;
}

/**
 * オーバーレイの設定（/api/stream-data）。変えたら SAVE_DELAY_MS 待って、保存済みの値と比べて変わった項目だけを送る。
 * 保存は 1 つずつ順に送り、結果はヘッダーの「変更はすぐ保存」に知らせる（失敗したら次の保存で送り直す）。
 * 画面を離れるときは、待っている変更をすぐに送る
 */
export function useStreamSettings(): StreamSettingsState {
    const {report} = useSaveStatus();
    const [settings, setSettings] = useState<StreamSettings | null>(null);
    const [loadError, setLoadError] = useState(false);
    // サーバーに保存済みの値（変わった項目だけを送るために比べる）
    const savedRef = useRef<StreamSettings | null>(null);
    const settingsRef = useRef<StreamSettings | null>(null);
    // 保存は 1 つずつ順に送る（前の保存の結果で savedRef を更新してから次を比べる）
    const savingRef = useRef<Promise<void>>(Promise.resolve());

    const save = useCallback(() => {
        savingRef.current = savingRef.current.then(async () => {
            const current = settingsRef.current;
            const saved = savedRef.current;
            if (!current || !saved) return;
            const update = changedSettings(current, saved);
            if (Object.keys(update).length === 0) return;
            try {
                await axios.post('/api/stream-data', update);
                savedRef.current = {...saved, ...update};
                report(true);
            } catch {
                report(false);
            }
        });
    }, [report]);

    useEffect(() => {
        const load = async () => {
            const res = await axios.get<StreamData>('/api/stream-data');
            let loaded = pickSettings(res.data);
            const legacy = readLegacySettings();
            if (Object.keys(legacy).length > 0) {
                // サーバーに保存が無いときだけ、以前の localStorage の設定を移す（保存済みなら、そちらのほうが新しい）
                if (!res.data.settingsStored) {
                    const migrated = await axios.post<StreamData>('/api/stream-data', legacy);
                    loaded = pickSettings(migrated.data);
                }
                removeItem(LEGACY_LOCAL_STORAGE_KEY);
            }
            savedRef.current = loaded;
            settingsRef.current = loaded;
            setSettings(loaded);
        };
        load().catch((e) => {
            console.error('Failed to load the settings', e);
            setLoadError(true);
        });
    }, []);

    // 変えたら少し待って保存する（入力のたびには送らない）
    useEffect(() => {
        settingsRef.current = settings;
        if (!settings) return;
        const timer = setTimeout(save, SAVE_DELAY_MS);
        return () => clearTimeout(timer);
    }, [settings, save]);

    // 画面を離れるときは、待っている変更をすぐに送る
    useEffect(() => {
        // タブを閉じる・再読み込みするとき。ページが消えても送り終えるよう keepalive で送る
        const handlePageHide = () => {
            const current = settingsRef.current;
            const saved = savedRef.current;
            if (!current || !saved) return;
            const update = changedSettings(current, saved);
            if (Object.keys(update).length === 0) return;
            const body = JSON.stringify(update);
            void fetch('/api/stream-data', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body,
                // keepalive は本文が 64KiB を超えると送れずに失敗するので、大きいとき（バーンダウンの履歴が多いなど）は付けずに送る
                keepalive: new Blob([body]).size <= KEEPALIVE_MAX_BYTES,
            }).catch(() => undefined);
        };
        window.addEventListener('pagehide', handlePageHide);
        return () => {
            window.removeEventListener('pagehide', handlePageHide);
            // アプリの中でほかの画面（準備・配信中・設定など）に移るとき
            save();
        };
    }, [save]);

    const update = useCallback((delta: Partial<StreamSettings>) => {
        setSettings((prev) => prev ? {...prev, ...delta} : null);
    }, []);

    return {settings, loadError, update};
}
