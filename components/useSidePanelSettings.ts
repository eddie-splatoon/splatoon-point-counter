'use client';

import axios from 'axios';
import {useCallback, useEffect, useRef, useState} from 'react';

import {SidePanelSettings} from '../lib/sidePanelTypes';

import {useSaveStatus} from './controlPanelContext';

/** 変える項目。関数なら、保存の直前に読み直した最新の設定から作る（お題の追加・削除・並べ替えなど） */
export type SidePanelChange = Partial<SidePanelSettings> | ((settings: SidePanelSettings) => Partial<SidePanelSettings>);

export interface SidePanelSettingsState {
    settings: SidePanelSettings | null;
    error: string;
    update: (change: SidePanelChange) => void;
}

const apply = (settings: SidePanelSettings, change: SidePanelChange) =>
    ({...settings, ...(typeof change === 'function' ? change(settings) : change)});

/**
 * サイドパネルの設定（お題を含む）を読み込み、変えたらその場で保存する。画面ごとに 1 回だけ使い、カードに渡す。
 * 設定は丸ごと保存するので、保存のたびに最新の設定を読み直して、変えた項目だけを重ねて送る
 * （配信中の画面でチェックしたお題の達成などを、開いたときの古い値で戻さないため）。保存は 1 つずつ順に送る
 */
export const useSidePanelSettings = (): SidePanelSettingsState => {
    const [settings, setSettings] = useState<SidePanelSettings | null>(null);
    const [error, setError] = useState('');
    const {report} = useSaveStatus();
    const queue = useRef<Promise<void>>(Promise.resolve());
    // 送っていない・送っている途中の保存の数
    const saving = useRef(0);

    const load = useCallback(async () => {
        try {
            setSettings((await axios.get<SidePanelSettings>('/api/side-panel')).data);
        } catch {
            setError('サイドパネルの設定の読み込みに失敗しました。サーバーを確認してください。');
        }
    }, []);

    useEffect(() => {
        // マウント時に API から設定を読み込む（ほかのカードと同じパターン）
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void load();
    }, [load]);

    const update = useCallback((change: SidePanelChange) => {
        // 表示は送る前に変えておく（応答で上書きすると、続けて操作したときに前の値に戻るため）
        setSettings((current) => (current ? apply(current, change) : current));
        setError('');
        saving.current += 1;
        queue.current = queue.current.then(async () => {
            try {
                const latest = (await axios.get<SidePanelSettings>('/api/side-panel')).data;
                const next = apply(latest, change);
                await axios.post('/api/side-panel', next);
                report(true);
                // ほかの画面で変えたものも、ここで画面に合わせる（後の変更が残っていれば、その保存で合わせる）
                if (saving.current === 1) setSettings(next);
            } catch {
                setError('設定の保存に失敗しました。');
                report(false);
                await load();
            } finally {
                saving.current -= 1;
            }
        });
    }, [load, report]);

    return {settings, error, update};
};
