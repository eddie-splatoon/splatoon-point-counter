'use client';

import axios from 'axios';
import {AnimatePresence, motion} from 'motion/react';
import React, {useCallback, useEffect, useState} from 'react';

import BurndownChart from '../../components/BurndownChart';
import SalmonStats from '../../components/SalmonStats';
import {SalmonSummary} from '../../lib/salmonTypes';
import {SidePanelSettings, pickSlot} from '../../lib/sidePanelTypes';
import {StreamData} from '../api/stream-data/route';

const POLLING_INTERVAL = 2000; // 2秒
const NO_CACHE_HEADERS = {'Cache-Control': 'no-cache', 'Pragma': 'no-cache', 'Expires': '0'};

/**
 * 配信画面右側（250x584）のサイドパネル。
 * 上段はフォロワーゲージ用（#61 で追加）、下段はコントロールパネルで選んだスロットを表示する。
 */
const SidePanelOverlayPage: React.FC = () => {
    const [settings, setSettings] = useState<SidePanelSettings | null>(null);
    const [salmon, setSalmon] = useState<SalmonSummary | null>(null);
    const [streamData, setStreamData] = useState<StreamData | null>(null);
    // ローテーションの位置。key（ローテーションの設定）が変わったら先頭からやり直す
    const [rotation, setRotation] = useState({key: '', index: 0});

    const fetchData = useCallback(async () => {
        // 1つの API が落ちていても、他のスロットは表示し続ける
        const [settingsRes, salmonRes, streamRes] = await Promise.allSettled([
            axios.get<SidePanelSettings>('/api/side-panel', {headers: NO_CACHE_HEADERS}),
            axios.get<SalmonSummary>('/api/salmon', {headers: NO_CACHE_HEADERS}),
            axios.get<StreamData>('/api/stream-data', {headers: NO_CACHE_HEADERS}),
        ]);
        if (settingsRes.status === 'fulfilled') setSettings(settingsRes.value.data);
        if (salmonRes.status === 'fulfilled') setSalmon(salmonRes.value.data);
        if (streamRes.status === 'fulfilled') setStreamData(streamRes.value.data);
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void fetchData();
        const interval = setInterval(fetchData, POLLING_INTERVAL);
        return () => clearInterval(interval);
    }, [fetchData]);

    const autoRotate = settings?.autoRotate ?? false;
    const rotateSeconds = settings?.rotateSeconds ?? 0;
    const rotationKey = autoRotate ? `${rotateSeconds}:${settings?.enabledSlots.join(',')}` : '';
    // OFF を挟んだ場合も含め、設定が変わったらレンダー中に位置を戻す（React の「props の変化に合わせて state を調整する」パターン）
    if (rotation.key !== rotationKey) setRotation({key: rotationKey, index: 0});
    const rotationIndex = rotation.key === rotationKey ? rotation.index : 0;
    useEffect(() => {
        if (!rotationKey) return;
        // 設定が変わるとタイマーも作り直すので、新しい設定の最初の周期は満了まで待つ
        const timer = setInterval(() => setRotation((r) => ({...r, index: r.index + 1})), rotateSeconds * 1000);
        return () => clearInterval(timer);
    }, [rotationKey, rotateSeconds]);

    if (!settings) return <div className="w-[250px] h-[584px]"/>;

    const slot = pickSlot(settings, rotationIndex);

    const renderSlot = () => {
        switch (slot) {
            case 'salmon':
                return salmon && <SalmonStats lastJob={salmon.lastJob} totals={salmon.totals}/>;
            case 'burndown':
                return streamData?.burndown && <BurndownChart data={streamData.burndown}/>;
        }
    };

    return (
        <div
            className="w-[250px] h-[584px] flex flex-col"
            style={{backgroundColor: 'transparent', fontFamily: streamData?.fontFamily || 'sans-serif'}}
        >
            {/* 上段: フォロワーゲージ（#61 で追加） */}
            {/* 下段: コントロールパネルで選んだスロット */}
            <div className="relative flex-1" data-testid="side-panel-slot">
                <AnimatePresence>
                    <motion.div
                        key={slot}
                        className="absolute inset-0 flex flex-col items-center"
                        initial={{opacity: 0}}
                        animate={{opacity: 1}}
                        exit={{opacity: 0}}
                        transition={{duration: 0.8}}
                        data-slot={slot}
                    >
                        {renderSlot()}
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    );
};

export default SidePanelOverlayPage;
