'use client';

import axios from 'axios';
import React, {createContext, useCallback, useContext, useEffect, useMemo, useState} from 'react';

import {TelopData, TelopPreset} from '../lib/telopTypes';

// コントロールパネルの画面（準備・配信中・振り返り・設定）をまたいで共有するもの。共通の外枠（ControlPanelShell）が持つ

interface SaveStatus {
    /** 最後の保存に失敗したか（ヘッダーの「変更はすぐ保存」を赤くする） */
    failed: boolean;
    report: (ok: boolean) => void;
}

const SaveStatusContext = createContext<SaveStatus>({failed: false, report: () => undefined});

export const SaveStatusProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
    const [failed, setFailed] = useState(false);
    const report = useCallback((ok: boolean) => setFailed(!ok), []);
    const value = useMemo(() => ({failed, report}), [failed, report]);
    return <SaveStatusContext.Provider value={value}>{children}</SaveStatusContext.Provider>;
};

/** 保存の結果を知らせる・失敗しているかを見る */
export const useSaveStatus = () => useContext(SaveStatusContext);

interface TelopPresets {
    presets: TelopPreset[] | null;
    error: string;
    /** プリセットを読み込み直す（設定でプリセットを編集したとき） */
    reload: () => void;
    show: (presetId: number) => void;
}

const TelopPresetsContext = createContext<TelopPresets | null>(null);

export const TelopPresetsProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
    const [presets, setPresets] = useState<TelopPreset[] | null>(null);
    const [error, setError] = useState('');
    const [revision, setRevision] = useState(0);

    useEffect(() => {
        let active = true;
        axios.get<TelopData>('/api/telop')
            .then((res) => {
                if (!active) return;
                setPresets(res.data.presets);
                setError('');
            })
            .catch(() => active && setError('テロップのプリセットを読み込めませんでした。'));
        return () => {
            active = false;
        };
    }, [revision]);

    const reload = useCallback(() => setRevision((n) => n + 1), []);
    const show = useCallback((presetId: number) => {
        setError('');
        axios.post('/api/telop', {presetId}).catch(() => setError('テロップを出せませんでした。'));
    }, []);

    const value = useMemo(() => ({presets, error, reload, show}), [presets, error, reload, show]);
    return <TelopPresetsContext.Provider value={value}>{children}</TelopPresetsContext.Provider>;
};

/** テロップのプリセット（ボタン・数字キー・設定の編集で共有する）。TelopPresetsProvider の中で使う */
export const useTelopPresets = (): TelopPresets => {
    const value = useContext(TelopPresetsContext);
    if (!value) throw new Error('useTelopPresets must be used inside TelopPresetsProvider');
    return value;
};
