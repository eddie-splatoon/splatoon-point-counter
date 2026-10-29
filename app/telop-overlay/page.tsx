'use client';

import axios from 'axios';
import {AnimatePresence, motion} from 'motion/react';
import React, {useState, useEffect, useCallback} from 'react';

import {TELOP_DISPLAY_DURATION, Telop, TelopData} from '../../lib/telopTypes';

// ワンボタンで出すものなので、字幕（1秒）より短い間隔で問い合わせる
const POLLING_INTERVAL = 500;

// インク風の帯の色。テロップごとに順に変える
const INK_COLORS = ['#FF6F00', '#B05CFF', '#00C2FF', '#FF3EA5'];

const TelopOverlayPage: React.FC = () => {
    // 表示中のテロップと、ブラウザの時計で消す時刻
    const [shown, setShown] = useState<{telop: Telop; hideAt: number} | null>(null);
    const [now, setNow] = useState(0);

    const fetchDataInternal = useCallback(async () => {
        try {
            const res = await axios.get<TelopData>('/api/telop', {
                headers: {
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache',
                    'Expires': '0',
                },
            });
            if (res.status === 200) {
                const {current, serverTime} = res.data;
                // 経過時間はサーバーの時計どうしで測り、残り時間をブラウザの時計に置き換える（OBS とサーバーの時計がずれていてもよいように）
                setShown(current ? {telop: current, hideAt: Date.now() + TELOP_DISPLAY_DURATION - (serverTime - current.timestamp)} : null);
            }
        } catch (error) {
            console.error('Failed to fetch telop data:', error);
        } finally {
            // 表示期限の判定に使う現在時刻をポーリングごとに更新する
            setNow(Date.now());
        }
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchDataInternal().catch(error => {
            console.error('Initial telop fetch error:', error);
        });
        const interval = setInterval(fetchDataInternal, POLLING_INTERVAL);
        return () => clearInterval(interval);
    }, [fetchDataInternal]);

    // 出してから表示時間内のものだけ表示する（オーバーレイを開き直したときに、古いテロップは出さない）
    const telop = shown && now < shown.hideAt ? shown.telop : null;

    return (
        <div
            className="w-screen h-screen flex flex-col items-center justify-start pt-16 overflow-hidden"
            style={{backgroundColor: 'transparent'}}
        >
            <AnimatePresence mode="popLayout">
                {telop && (
                    <motion.div
                        key={telop.id}
                        data-testid="telop"
                        initial={{opacity: 0, x: -120, skewX: -12}}
                        animate={{opacity: 1, x: 0, skewX: -8}}
                        exit={{opacity: 0, x: 120}}
                        transition={{type: 'spring', stiffness: 400, damping: 28}}
                        className="px-10 py-3 rounded-2xl shadow-2xl border-4 border-white text-white font-black text-center"
                        style={{
                            backgroundColor: INK_COLORS[telop.id % INK_COLORS.length],
                            fontSize: 56,
                            maxWidth: '90%',
                            textShadow: '3px 3px 0 rgba(0, 0, 0, 0.6)',
                        }}
                    >
                        {telop.text}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default TelopOverlayPage;
