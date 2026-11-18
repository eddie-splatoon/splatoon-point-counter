'use client';

import axios from 'axios';
import {AnimatePresence, motion} from 'motion/react';
import React, {useCallback, useEffect, useRef, useState} from 'react';

import {StreamData} from '../app/api/stream-data/route';
import {SCREEN_STAMP_DISPLAY_MS, ScreenStampData, ScreenStampShown} from '../lib/screenStampTypes';

// チャットに合わせて出すものなので、テロップと同じ間隔で問い合わせる
const POLLING_INTERVAL = 500;
const FONT_POLLING_INTERVAL = 2000;
const NO_CACHE = {'Cache-Control': 'no-cache', 'Pragma': 'no-cache', 'Expires': '0'};

// スタンプ（フォロワースタンプの文字の画像）と同じ色
const STAMP_ORANGE = '#FF7A1A';
const STAMP_NAVY = '#121A34';

export type ScreenStampLayout = 'landscape' | 'portrait';

// 置き方（px）。landscape（1920x1080）は配信画面のゲーム画面（x 61〜1571 / y 40〜888 付近）の右上（テロップは右下、スコア表示は左下）。
// portrait（1080x1920）は上部のサイドパネル（縦型配信用、y 115〜555 付近）の下の右寄せ
const LAYOUT_STYLES: Record<ScreenStampLayout, {position: React.CSSProperties; fontSize: number; imageSize: number}> = {
    landscape: {position: {top: 72, right: 380}, fontSize: 120, imageSize: 280},
    portrait: {position: {top: 600, right: 60}, fontSize: 110, imageSize: 260},
};

interface ScreenStampOverlayProps {
    layout: ScreenStampLayout;
}

/** 画面スタンプのオーバーレイの本体。/screen-stamp-overlay（横長）と /screen-stamp-overlay/vertical（縦型配信用）で共通 */
const ScreenStampOverlay: React.FC<ScreenStampOverlayProps> = ({layout}) => {
    const style = LAYOUT_STYLES[layout];
    // 表示中のスタンプと、ブラウザの時計で消す時刻
    const [shown, setShown] = useState<{stamp: ScreenStampShown; hideAt: number} | null>(null);
    const [now, setNow] = useState(0);
    const [fontFamily, setFontFamily] = useState('');
    // 画像を読み込めなかったスタンプ（出した時刻）。文字で描き直す
    const [brokenImage, setBrokenImage] = useState<number | null>(null);
    // 最後に見たスタンプ（出した時刻）。undefined はまだ一度も取得していない（開いた時点で出ていたものは出さない）
    const lastSeenRef = useRef<number | null | undefined>(undefined);

    const fetchState = useCallback(async () => {
        try {
            const res = await axios.get<ScreenStampData>('/api/screen-stamp', {headers: NO_CACHE});
            const {current, serverTime} = res.data;
            // ID はサーバーの再起動で振り直されるので、出した時刻で見分ける
            const seen = current?.timestamp ?? null;
            const isNew = lastSeenRef.current !== undefined && seen !== null && seen !== lastSeenRef.current;
            lastSeenRef.current = seen;
            if (isNew && current) {
                // 経過時間はサーバーの時計どうしで測り、残り時間をブラウザの時計に置き換える
                setShown({stamp: current, hideAt: Date.now() + SCREEN_STAMP_DISPLAY_MS - (serverTime - current.timestamp)});
            }
        } catch (error) {
            console.error('Failed to fetch screen stamp:', error);
        } finally {
            setNow(Date.now());
        }
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void fetchState();
        const interval = setInterval(fetchState, POLLING_INTERVAL);
        return () => clearInterval(interval);
    }, [fetchState]);

    // 2 秒で消すため、出している間は問い合わせとは別に時計を進める
    useEffect(() => {
        if (!shown) return;
        const timeout = setTimeout(() => setNow(Date.now()), Math.max(0, shown.hideAt - Date.now()));
        return () => clearTimeout(timeout);
    }, [shown]);

    const fetchFont = useCallback(async () => {
        try {
            const res = await axios.get<StreamData>('/api/stream-data', {headers: NO_CACHE});
            if (res.status === 200) setFontFamily(res.data.fontFamily);
        } catch (error) {
            console.error('Failed to fetch font setting:', error);
        }
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void fetchFont();
        const interval = setInterval(fetchFont, FONT_POLLING_INTERVAL);
        return () => clearInterval(interval);
    }, [fetchFont]);

    const visible = shown !== null && now < shown.hideAt ? shown.stamp : null;
    const useImage = visible?.imageUrl && brokenImage !== visible.timestamp;

    return (
        <div
            data-testid="screen-stamp-area"
            data-layout={layout}
            className="relative w-screen h-screen overflow-hidden"
            style={{backgroundColor: 'transparent', fontFamily: fontFamily || 'sans-serif'}}
        >
            <AnimatePresence>
                {visible && (
                    <motion.div
                        key={visible.timestamp}
                        data-testid="screen-stamp"
                        className="absolute"
                        style={style.position}
                        initial={{opacity: 0, scale: 0.4, rotate: -8}}
                        animate={{opacity: 1, scale: [0.4, 1.15, 0.95, 1], rotate: -4}}
                        exit={{opacity: 0, scale: 0.8}}
                        transition={{duration: 0.45, ease: 'easeOut'}}
                    >
                        {useImage ? (
                            // スタンプの画像は設定で差し替える（外部の URL もあるので next/image は通さない）
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={visible.imageUrl ?? undefined}
                                alt={visible.label}
                                width={style.imageSize}
                                height={style.imageSize}
                                style={{objectFit: 'contain', filter: 'drop-shadow(4px 6px 0 rgba(0, 0, 0, 0.45))'}}
                                onError={() => setBrokenImage(visible.timestamp)}
                            />
                        ) : (
                            <div
                                className="font-black text-white whitespace-nowrap"
                                style={{
                                    fontSize: style.fontSize,
                                    lineHeight: 1.1,
                                    padding: '0.18em 0.45em',
                                    backgroundColor: STAMP_ORANGE,
                                    border: `12px solid ${STAMP_NAVY}`,
                                    borderRadius: 40,
                                    WebkitTextStroke: `6px ${STAMP_NAVY}`,
                                    paintOrder: 'stroke fill',
                                    boxShadow: '6px 8px 0 rgba(0, 0, 0, 0.45)',
                                }}
                            >
                                {visible.label}
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default ScreenStampOverlay;
