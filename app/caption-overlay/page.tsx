'use client';

import axios from 'axios';
import {AnimatePresence, motion} from 'motion/react';
import React, {useState, useEffect, useCallback} from 'react';

import {CaptionData} from '../api/caption/route';

const POLLING_INTERVAL = 1000; // 1秒
const CAPTION_DISPLAY_DURATION = 8000; // 字幕の表示時間 (8秒)
const MAX_VISIBLE_LINES = 2;

const CaptionOverlayPage: React.FC = () => {
    const [data, setData] = useState<CaptionData | null>(null);
    const [now, setNow] = useState(0);

    const fetchDataInternal = useCallback(async () => {
        try {
            const res = await axios.get<CaptionData>('/api/caption', {
                headers: {
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache',
                    'Expires': '0',
                },
            });
            if (res.status === 200) {
                setData(res.data);
            }
        } catch (error) {
            console.error('Failed to fetch caption data:', error);
        } finally {
            // 表示期限の判定に使う現在時刻をポーリングごとに更新する
            setNow(Date.now());
        }
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchDataInternal().catch(error => {
            console.error('Initial caption fetch error:', error);
        });
        const interval = setInterval(fetchDataInternal, POLLING_INTERVAL);
        return () => clearInterval(interval);
    }, [fetchDataInternal]);

    const visibleLines = (data?.lines ?? [])
        .filter(line => now - line.timestamp < CAPTION_DISPLAY_DURATION)
        .slice(-MAX_VISIBLE_LINES);

    return (
        <div
            className="w-screen h-screen flex flex-col items-center justify-end pb-8 gap-2"
            style={{backgroundColor: 'transparent'}}
        >
            <AnimatePresence initial={false}>
                {visibleLines.map(line => (
                    <motion.div
                        key={line.id}
                        layout
                        initial={{opacity: 0, y: 20}}
                        animate={{opacity: 1, y: 0}}
                        exit={{opacity: 0}}
                        transition={{duration: 0.4}}
                        className="px-6 py-2 rounded-lg bg-black/60 text-white font-bold text-center"
                        style={{fontSize: 40, textShadow: '2px 2px 4px rgba(0, 0, 0, 0.8)', maxWidth: '90%'}}
                    >
                        {line.text}
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
};

export default CaptionOverlayPage;
