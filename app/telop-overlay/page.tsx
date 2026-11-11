'use client';

import axios from 'axios';
import {AnimatePresence, motion} from 'motion/react';
import React, {useState, useEffect, useCallback} from 'react';

import FireworksEffect from '../../components/FireworksEffect';
import SparkleEffect from '../../components/SparkleEffect';
import {Telop, TelopData, telopDisplayDuration} from '../../lib/telopTypes';
import {StreamData} from '../api/stream-data/route';

// ワンボタンで出すものなので、字幕（1秒）より短い間隔で問い合わせる
const POLLING_INTERVAL = 500;
// 共通設定のフォントは頻繁に変わらないので、ほかのオーバーレイと同じくらいの間隔で問い合わせる
const FONT_POLLING_INTERVAL = 2000;
// 共通設定のフォントに追従しないテロップ（そのフォントで文字化けするもの）に使うフォント
const FALLBACK_FONT = 'sans-serif';

// インク風の帯の色。テロップごとに順に変える
const INK_COLORS = ['#FF6F00', '#B05CFF', '#00C2FF', '#FF3EA5'];
// フォローのお礼のテロップの帯。インクの色を全部混ぜて、通常のテロップより目立たせる
const FOLLOW_BACKGROUND = `linear-gradient(90deg, ${INK_COLORS.join(', ')})`;

const TelopOverlayPage: React.FC = () => {
    // 表示中のテロップと、ブラウザの時計で消す時刻
    const [shown, setShown] = useState<{telop: Telop; hideAt: number} | null>(null);
    const [now, setNow] = useState(0);
    const [fontFamily, setFontFamily] = useState('');

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
                setShown(current ? {telop: current, hideAt: Date.now() + telopDisplayDuration(current) - (serverTime - current.timestamp)} : null);
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

    const fetchFont = useCallback(async () => {
        try {
            const res = await axios.get<StreamData>('/api/stream-data', {
                headers: {'Cache-Control': 'no-cache', 'Pragma': 'no-cache', 'Expires': '0'},
            });
            if (res.status === 200) setFontFamily(res.data.fontFamily);
        } catch (error) {
            // 取れなければ直前のフォントのまま（初回なら既定のフォント）で表示を続ける
            console.error('Failed to fetch font setting:', error);
        }
    }, []);

    useEffect(() => {
        // マウント時に取得してからポーリングする（テロップの取得と同じパターン）
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void fetchFont();
        const interval = setInterval(fetchFont, FONT_POLLING_INTERVAL);
        return () => clearInterval(interval);
    }, [fetchFont]);

    // 出してから表示時間内のものだけ表示する（オーバーレイを開き直したときに、古いテロップは出さない）
    const telop = shown && now < shown.hideAt ? shown.telop : null;
    const isFollow = telop?.effect === 'follow';

    return (
        <div
            className="relative w-screen h-screen flex flex-col items-center justify-start pt-16 overflow-hidden"
            style={{backgroundColor: 'transparent'}}
        >
            {/* フォローのお礼には花火とキラキラを重ねる。テロップごとに作り直して再生する */}
            {isFollow && <FireworksEffect key={telop.id} trigger/>}
            <SparkleEffect trigger={isFollow ? telop.id : null}/>
            <AnimatePresence mode="popLayout">
                {telop && (
                    <motion.div
                        key={telop.id}
                        data-testid="telop"
                        initial={isFollow ? {opacity: 0, scale: 0.2, rotate: -8} : {opacity: 0, x: -120, skewX: -12}}
                        animate={isFollow ? {opacity: 1, scale: [0.2, 1.25, 0.95, 1], rotate: [-8, 4, -2, 0]} : {opacity: 1, x: 0, skewX: -8}}
                        exit={isFollow ? {opacity: 0, scale: 1.4} : {opacity: 0, x: 120}}
                        transition={isFollow ? {duration: 0.8, ease: 'easeOut'} : {type: 'spring', stiffness: 400, damping: 28}}
                        className="relative z-10 px-10 py-3 rounded-2xl shadow-2xl border-4 border-white text-white font-black text-center"
                        style={{
                            background: isFollow ? FOLLOW_BACKGROUND : INK_COLORS[telop.id % INK_COLORS.length],
                            fontFamily: telop.followFont ? fontFamily || FALLBACK_FONT : FALLBACK_FONT,
                            fontSize: isFollow ? 80 : 56,
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
