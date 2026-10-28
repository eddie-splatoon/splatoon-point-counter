'use client';

import axios from 'axios';
import {AnimatePresence, motion} from 'motion/react';
import React, {useCallback, useEffect, useState} from 'react';

import BurndownChart from '../../components/BurndownChart';
import ChallengeList from '../../components/ChallengeList';
import InkTankGauge from '../../components/InkTankGauge';
import SalmonStats from '../../components/SalmonStats';
import {SalmonSummary} from '../../lib/salmonTypes';
import {FULL_HEIGHT_SLOTS, SidePanelSettings, SidePanelSlot, getFollowerProgress, pickSlots} from '../../lib/sidePanelTypes';
import {StreamData} from '../api/stream-data/route';

import type {TwitchData} from '../api/twitch/route';

const POLLING_INTERVAL = 2000; // 2秒
const NO_CACHE_HEADERS = {'Cache-Control': 'no-cache', 'Pragma': 'no-cache', 'Expires': '0'};

/**
 * 配信画面右側（250x584）のサイドパネル。
 * 上段はフォロワーゲージ、下段はコントロールパネルで選んだスロットを表示する。
 */
const SidePanelOverlayPage: React.FC = () => {
    const [settings, setSettings] = useState<SidePanelSettings | null>(null);
    const [salmon, setSalmon] = useState<SalmonSummary | null>(null);
    const [streamData, setStreamData] = useState<StreamData | null>(null);
    const [twitch, setTwitch] = useState<TwitchData | null>(null);
    // ローテーションの位置。key（ローテーションの設定）が変わったら先頭からやり直す
    const [rotation, setRotation] = useState({key: '', index: 0});

    const fetchData = useCallback(async () => {
        // 1つの API が落ちていても、他のスロットは表示し続ける
        const [settingsRes, salmonRes, streamRes, twitchRes] = await Promise.allSettled([
            axios.get<SidePanelSettings>('/api/side-panel', {headers: NO_CACHE_HEADERS}),
            axios.get<SalmonSummary>('/api/salmon', {headers: NO_CACHE_HEADERS}),
            axios.get<StreamData>('/api/stream-data', {headers: NO_CACHE_HEADERS}),
            axios.get<TwitchData>('/api/twitch', {headers: NO_CACHE_HEADERS}),
        ]);
        if (settingsRes.status === 'fulfilled') setSettings(settingsRes.value.data);
        if (salmonRes.status === 'fulfilled') setSalmon(salmonRes.value.data);
        if (streamRes.status === 'fulfilled') setStreamData(streamRes.value.data);
        if (twitchRes.status === 'fulfilled') setTwitch(twitchRes.value.data);
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

    const slots = pickSlots(settings, rotationIndex);
    // 表示する組み合わせが変わったら、まとめてクロスフェードする
    const slotsKey = slots.join('+');
    // Twitch 連携スクリプトが未起動、または目標が無いときはゲージを出さない
    const followerProgress = twitch && getFollowerProgress(twitch, settings.followerGoal);

    const renderSlot = (slot: SidePanelSlot) => {
        switch (slot) {
            case 'salmon':
                return salmon && <SalmonStats lastJob={salmon.lastJob} totals={salmon.totals}/>;
            case 'challenges':
                return <ChallengeList challenges={settings.challenges}/>;
            case 'burndown':
                return streamData?.burndown && <BurndownChart data={streamData.burndown}/>;
        }
    };

    return (
        <div
            className="relative overflow-hidden w-[250px] h-[584px] flex flex-col"
            style={{backgroundColor: 'transparent', fontFamily: streamData?.fontFamily || 'sans-serif'}}
        >
            {/* 上段: フォロワーゲージ（泡と花火はパネル全体を覆う） */}
            {followerProgress && twitch && (
                <InkTankGauge current={followerProgress.current} target={followerProgress.target} lastFollowAt={twitch.lastFollowAt}/>
            )}
            {/* 下段: コントロールパネルで選んだスロット（複数なら上から順に並べる） */}
            <div className="relative flex-1" data-testid="side-panel-slot">
                <AnimatePresence>
                    <motion.div
                        key={slotsKey}
                        className="absolute inset-0 flex flex-col items-center gap-3"
                        initial={{opacity: 0}}
                        animate={{opacity: 1}}
                        exit={{opacity: 0}}
                        transition={{duration: 0.8}}
                        data-slots={slotsKey}
                    >
                        {slots.map((slot) => (
                            <div
                                key={slot}
                                // 下段全体を使うスロットは残りの高さいっぱいに広げる
                                className={FULL_HEIGHT_SLOTS.includes(slot) ? 'flex-1 min-h-0 w-full flex justify-center' : 'shrink-0'}
                                data-slot={slot}
                            >
                                {renderSlot(slot)}
                            </div>
                        ))}
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    );
};

export default SidePanelOverlayPage;
