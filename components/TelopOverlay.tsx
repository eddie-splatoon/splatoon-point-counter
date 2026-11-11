'use client';

import axios from 'axios';
import {AnimatePresence, motion} from 'motion/react';
import React, {useState, useEffect, useCallback, useRef} from 'react';

import {StreamData} from '../app/api/stream-data/route';
import {Telop, TelopData, telopDisplayDuration} from '../lib/telopTypes';

import FireworksEffect from './FireworksEffect';
import SparkleEffect from './SparkleEffect';

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

// テロップの位置（1920x1080 のオーバーレイでの px）。配信画面のゲーム画面（x 61〜1571 / y 40〜888 付近）の右下に、
// 右端を揃えて出す。ゲーム画面の右下の角には立ち絵（x 1427〜 / y 618〜 付近）が重なるので、右端はその左に置く
const TELOP_RIGHT = 520;
const TELOP_BOTTOM = 232;
// ゲーム画面の左端からはみ出さない幅
const TELOP_MAX_WIDTH = 1300;
// 縦型配信（1080x1920）では、上部のサイドパネル（縦型配信用、y 115〜555 付近）と重ならないよう、画面の下から 1/4 くらいに出す
const PORTRAIT_TELOP_BOTTOM = 440;

export type TelopLayout = 'landscape' | 'portrait';

// 置き方。portrait は横幅が狭いので文字を少し大きくし、長い文は横幅に合わせて折り返す（テロップは 30 文字までなので 2 行ほどに収まる）
const LAYOUT_STYLES: Record<TelopLayout, {containerClass: string; padding: React.CSSProperties; maxWidth: number | string; fontSize: number; followFontSize: number}> = {
    landscape: {containerClass: 'items-end', padding: {paddingRight: TELOP_RIGHT, paddingBottom: TELOP_BOTTOM}, maxWidth: TELOP_MAX_WIDTH, fontSize: 56, followFontSize: 64},
    portrait: {containerClass: 'items-center', padding: {paddingBottom: PORTRAIT_TELOP_BOTTOM}, maxWidth: '90%', fontSize: 64, followFontSize: 72},
};

interface TelopOverlayProps {
    layout: TelopLayout;
}

/** 実況テロップのオーバーレイの本体。/telop-overlay（横長）と /telop-overlay/vertical（縦型配信用）で共通 */
const TelopOverlay: React.FC<TelopOverlayProps> = ({layout}) => {
    const layoutStyle = LAYOUT_STYLES[layout];
    // 表示中のテロップと、ブラウザの時計で消す時刻
    const [shown, setShown] = useState<{telop: Telop; hideAt: number} | null>(null);
    const [now, setNow] = useState(0);
    const [fontFamily, setFontFamily] = useState('');
    // 花火とキラキラを出しているフォローのお礼（出した時刻）。花火は 20 秒の演出なので、テロップ（8 秒）が消えても、別のテロップに置き換わっても続ける
    const [celebration, setCelebration] = useState<number | null>(null);
    // 最後に見たフォローのお礼（出した時刻）。undefined はまだ一度も取得していない（開いた時点で出ていたものは演出しない）
    const lastFollowIdRef = useRef<number | null | undefined>(undefined);

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
                // ID はサーバーの再起動で振り直されるので、出した時刻で見分ける
                const followId = current?.effect === 'follow' ? current.timestamp : null;
                if (lastFollowIdRef.current !== undefined && followId !== null && followId !== lastFollowIdRef.current) setCelebration(followId);
                if (lastFollowIdRef.current === undefined || followId !== null) lastFollowIdRef.current = followId;
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
            data-testid="telop-area"
            data-layout={layout}
            className={`relative w-screen h-screen flex flex-col justify-end overflow-hidden ${layoutStyle.containerClass}`}
            style={{backgroundColor: 'transparent', ...layoutStyle.padding}}
        >
            {/* フォローのお礼には花火とキラキラを重ねる。お礼ごとに作り直して再生する（花火は 20 秒で自分で消える） */}
            {celebration !== null && <FireworksEffect key={celebration} trigger/>}
            <SparkleEffect trigger={celebration}/>
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
                            fontSize: isFollow ? layoutStyle.followFontSize : layoutStyle.fontSize,
                            maxWidth: layoutStyle.maxWidth,
                            lineHeight: 1.25,
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

export default TelopOverlay;
