'use client';

import axios from 'axios';
import {AnimatePresence, motion} from 'motion/react';
import React, {useCallback, useEffect, useState} from 'react';

import BurndownChart from '../../components/BurndownChart';
import ChallengeList from '../../components/ChallengeList';
import InkTankGauge from '../../components/InkTankGauge';
import SalmonSchedule from '../../components/SalmonSchedule';
import SalmonStats from '../../components/SalmonStats';
import WeaponCard from '../../components/WeaponCard';
import {SalmonScheduleData, pickCurrentSchedule} from '../../lib/salmonSchedule';
import {SalmonSummary} from '../../lib/salmonTypes';
import {WeaponCard as WeaponCardData} from '../../lib/salmonWeapons';
import {FULL_HEIGHT_SLOTS, SidePanelSettings, SidePanelSlot, getFollowerProgress, pickRotationSlot} from '../../lib/sidePanelTypes';
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
    const [schedule, setSchedule] = useState<SalmonScheduleData | null>(null);
    const [weaponCard, setWeaponCard] = useState<WeaponCardData | null>(null);
    // スケジュールの開催中の判定と残り時間に使う現在時刻（ポーリングのたびに更新する）
    const [now, setNow] = useState(0);
    // ローテーションの位置。key（ローテーションの設定）が変わったら先頭からやり直す
    const [rotation, setRotation] = useState({key: '', index: 0});

    const fetchData = useCallback(async () => {
        // 1つの API が落ちていても、他のスロットは表示し続ける
        const [settingsRes, salmonRes, streamRes, twitchRes, scheduleRes, weaponCardRes] = await Promise.allSettled([
            axios.get<SidePanelSettings>('/api/side-panel', {headers: NO_CACHE_HEADERS}),
            axios.get<SalmonSummary>('/api/salmon', {headers: NO_CACHE_HEADERS}),
            axios.get<StreamData>('/api/stream-data', {headers: NO_CACHE_HEADERS}),
            axios.get<TwitchData>('/api/twitch', {headers: NO_CACHE_HEADERS}),
            // 外部 API への問い合わせはサーバー側で5分ごとにまとめている
            axios.get<SalmonScheduleData>('/api/salmon-schedule', {headers: NO_CACHE_HEADERS}),
            axios.get<WeaponCardData>('/api/weapon-card', {headers: NO_CACHE_HEADERS}),
        ]);
        setNow(Date.now());
        if (settingsRes.status === 'fulfilled') setSettings(settingsRes.value.data);
        if (salmonRes.status === 'fulfilled') setSalmon(salmonRes.value.data);
        if (streamRes.status === 'fulfilled') setStreamData(streamRes.value.data);
        if (twitchRes.status === 'fulfilled') setTwitch(twitchRes.value.data);
        if (scheduleRes.status === 'fulfilled') setSchedule(scheduleRes.value.data);
        if (weaponCardRes.status === 'fulfilled') setWeaponCard(weaponCardRes.value.data);
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void fetchData();
        const interval = setInterval(fetchData, POLLING_INTERVAL);
        return () => clearInterval(interval);
    }, [fetchData]);

    const rotateSeconds = settings?.rotateSeconds ?? 0;
    const rotationSlots = settings?.rotationSlots ?? [];
    const rotationKey = rotationSlots.length > 0 ? `${rotateSeconds}:${rotationSlots.join(',')}` : '';
    // ローテーション枠が空になった場合も含め、設定が変わったらレンダー中に位置を戻す（React の「props の変化に合わせて state を調整する」パターン）
    if (rotation.key !== rotationKey) setRotation({key: rotationKey, index: 0});
    const rotationIndex = rotation.key === rotationKey ? rotation.index : 0;
    useEffect(() => {
        if (!rotationKey) return;
        // 設定が変わるとタイマーも作り直すので、新しい設定の最初の周期は満了まで待つ
        const timer = setInterval(() => setRotation((r) => ({...r, index: r.index + 1})), rotateSeconds * 1000);
        return () => clearInterval(timer);
    }, [rotationKey, rotateSeconds]);

    if (!settings) return <div className="w-[250px] h-[584px]"/>;

    // 何も表示しないスロットはローテーションで飛ばす（renderSlot が null を返す条件と合わせる）
    const canShow = (slot: SidePanelSlot) => {
        switch (slot) {
            case 'schedule':
                return schedule !== null;
            case 'salmon':
                return salmon !== null;
            case 'weaponCard':
                return weaponCard !== null;
            case 'challenges':
                return settings.challenges.length > 0;
            case 'burndown':
                return Boolean(streamData?.burndown);
        }
    };
    const rotationSlot = pickRotationSlot(settings, rotationIndex, canShow);
    // Twitch 連携スクリプトが未起動、または目標が無いときはゲージを出さない
    const followerProgress = twitch && getFollowerProgress(twitch, settings.followerGoal);

    const renderSlot = (slot: SidePanelSlot) => {
        switch (slot) {
            case 'schedule':
                // 一度も取得できていない間は何も出さない（取得できたが開催中のものが無ければ、その旨を表示する）
                return schedule && <SalmonSchedule schedule={pickCurrentSchedule(schedule.entries, now)} now={now}/>;
            case 'salmon':
                return salmon && <SalmonStats lastJob={salmon.lastJob} totals={salmon.totals}/>;
            case 'weaponCard':
                return weaponCard && <WeaponCard card={weaponCard} compact/>;
            case 'challenges':
                return <ChallengeList challenges={settings.challenges}/>;
            case 'burndown':
                return streamData?.burndown && <BurndownChart data={streamData.burndown}/>;
        }
    };

    return (
        <div
            // 左右に少し余白を取り、配信画面の枠にぴったり付かないようにする（カードは max-w-full で縮む）
            className="relative overflow-hidden w-[250px] h-[584px] flex flex-col px-2"
            style={{backgroundColor: 'transparent', fontFamily: streamData?.fontFamily || 'sans-serif'}}
        >
            {/* 上段: フォロワーゲージ（泡と花火はパネル全体を覆う） */}
            {followerProgress && twitch && (
                <InkTankGauge current={followerProgress.current} target={followerProgress.target} lastFollowAt={twitch.lastFollowAt}/>
            )}
            {/* 下段: 固定枠を上から順に並べ、その下の残りのスペースでローテーション枠を1つずつ切り替える */}
            <div className="relative flex-1 min-h-0 flex flex-col items-center gap-3" data-testid="side-panel-slot">
                {settings.fixedSlots.map((slot) => (
                    <div
                        key={slot}
                        // 残りの高さいっぱいを使うスロットは広げる（固定枠では単独のときだけ選べる）
                        className={FULL_HEIGHT_SLOTS.includes(slot) ? 'flex-1 min-h-0 w-full flex justify-center' : 'shrink-0 w-full flex justify-center'}
                        data-slot={slot}
                        data-area="fixed"
                    >
                        {renderSlot(slot)}
                    </div>
                ))}
                {rotationSlot && (
                    <div className="relative flex-1 min-h-0 w-full" data-testid="side-panel-rotation">
                        <AnimatePresence>
                            <motion.div
                                key={rotationSlot}
                                className="absolute inset-0 flex flex-col items-center"
                                initial={{opacity: 0}}
                                animate={{opacity: 1}}
                                exit={{opacity: 0}}
                                transition={{duration: 0.8}}
                                data-slot={rotationSlot}
                                data-area="rotation"
                            >
                                {FULL_HEIGHT_SLOTS.includes(rotationSlot)
                                    ? <div className="flex-1 min-h-0 w-full flex justify-center">{renderSlot(rotationSlot)}</div>
                                    : renderSlot(rotationSlot)}
                            </motion.div>
                        </AnimatePresence>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SidePanelOverlayPage;
