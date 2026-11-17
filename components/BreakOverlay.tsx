'use client';

import axios from 'axios';
import {AnimatePresence, motion} from 'motion/react';
import React, {useCallback, useEffect, useState} from 'react';

import {StreamData} from '../app/api/stream-data/route';
import {BreakState, formatBreakElapsed, localBreakStart} from '../lib/breakTypes';

const POLLING_INTERVAL = 1000;
const FONT_POLLING_INTERVAL = 2000;
const NO_CACHE = {'Cache-Control': 'no-cache', 'Pragma': 'no-cache', 'Expires': '0'};

export type BreakLayout = 'landscape' | 'portrait';

// portrait（1080x1920）は横幅が狭いので、文字を少し小さくする
const FONT_SIZES: Record<BreakLayout, {title: number; sub: number; elapsed: number}> = {
    landscape: {title: 160, sub: 56, elapsed: 64},
    portrait: {title: 140, sub: 52, elapsed: 60},
};

interface BreakOverlayProps {
    layout: BreakLayout;
}

/** 休憩中の表示。/break-overlay（横長）と /break-overlay/vertical（縦型配信用）で共通。休憩中だけ半透明の暗幕に大きく出す */
const BreakOverlay: React.FC<BreakOverlayProps> = ({layout}) => {
    // 休憩を始めた時刻（ブラウザの時計）。休憩中でなければ null
    const [startedAt, setStartedAt] = useState<number | null>(null);
    const [now, setNow] = useState(0);
    const [fontFamily, setFontFamily] = useState('');
    const sizes = FONT_SIZES[layout];

    const fetchState = useCallback(async () => {
        try {
            const res = await axios.get<BreakState>('/api/break', {headers: NO_CACHE});
            setStartedAt(localBreakStart(res.data));
        } catch (error) {
            // 取れなければ直前の表示のまま
            console.error('Failed to fetch break state:', error);
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

    return (
        <div
            data-testid="break-area"
            data-layout={layout}
            className="relative w-screen h-screen overflow-hidden"
            style={{backgroundColor: 'transparent', fontFamily: fontFamily || 'sans-serif'}}
        >
            <AnimatePresence>
                {startedAt !== null && (
                    <motion.div
                        key="break"
                        data-testid="break"
                        initial={{opacity: 0}}
                        animate={{opacity: 1}}
                        exit={{opacity: 0}}
                        transition={{duration: 0.6}}
                        className="absolute inset-0 flex flex-col items-center justify-center gap-6 text-white font-black text-center"
                        style={{backgroundColor: 'rgba(10, 10, 20, 0.82)', textShadow: '4px 4px 0 rgba(0, 0, 0, 0.6)'}}
                    >
                        <motion.div
                            animate={{y: [0, -12, 0]}}
                            transition={{duration: 2.4, repeat: Infinity, ease: 'easeInOut'}}
                            style={{fontSize: sizes.title, lineHeight: 1.1}}
                        >
                            ☕ 休憩中
                        </motion.div>
                        <div style={{fontSize: sizes.sub}}>ちょっと待っててね🐟️</div>
                        <div data-testid="break-elapsed" className="tabular-nums" style={{fontSize: sizes.elapsed, color: '#FFD54F'}}>
                            {formatBreakElapsed(now - startedAt)}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default BreakOverlay;
