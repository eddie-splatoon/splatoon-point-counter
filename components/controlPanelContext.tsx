'use client';

import axios from 'axios';
import React, {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from 'react';

import {TELOP_DISPLAY_DURATION, TelopData, TelopPreset} from '../lib/telopTypes';

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
    /** いま配信画面に出ているはずのプリセット（出してから TELOP_DISPLAY_DURATION の間。コメントだけのものは出ないので含めない） */
    shownId: number | null;
}

const TelopPresetsContext = createContext<TelopPresets | null>(null);

export const TelopPresetsProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
    const [presets, setPresets] = useState<TelopPreset[] | null>(null);
    const [error, setError] = useState('');
    const [revision, setRevision] = useState(0);
    const [shownId, setShownId] = useState<number | null>(null);
    const shownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    // show の中で今のプリセットを見る（show を作り直すと、数字キーのリスナーを付け直すことになるため）
    const presetsRef = useRef<TelopPreset[] | null>(null);
    useEffect(() => {
        presetsRef.current = presets;
    }, [presets]);
    useEffect(() => () => {
        if (shownTimer.current) clearTimeout(shownTimer.current);
    }, []);

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
        axios.post('/api/telop', {presetId})
            .then(() => {
                // 配信画面に出したものだけ「表示中」にする（出ている間だけ）
                if (presetsRef.current?.find((p) => p.id === presetId)?.display === false) return;
                if (shownTimer.current) clearTimeout(shownTimer.current);
                setShownId(presetId);
                shownTimer.current = setTimeout(() => setShownId(null), TELOP_DISPLAY_DURATION);
            })
            .catch(() => setError('テロップを出せませんでした。'));
    }, []);

    const value = useMemo(() => ({presets, error, reload, show, shownId}), [presets, error, reload, show, shownId]);
    return <TelopPresetsContext.Provider value={value}>{children}</TelopPresetsContext.Provider>;
};

/** テロップのプリセット（ボタン・数字キー・設定の編集で共有する）。TelopPresetsProvider の中で使う */
export const useTelopPresets = (): TelopPresets => {
    const value = useContext(TelopPresetsContext);
    if (!value) throw new Error('useTelopPresets must be used inside TelopPresetsProvider');
    return value;
};
