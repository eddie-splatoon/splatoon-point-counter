'use client';

import React, { useState, useEffect } from 'react';
import ScoreDisplay from '../../components/ScoreDisplay';
import MessageScroller from '../../components/MessageScroller';
import { StreamData } from '../api/stream-data/route';

const POLLING_INTERVAL = 2000; // 2秒

const ObsOverlayPage: React.FC = () => {
    const [data, setData] = useState<StreamData | null>(null);

    const fetchData = async () => {
        try {
            const res = await fetch('/api/stream-data', { cache: 'no-store' }); // キャッシュ無効化
            if (res.ok) {
                const json: StreamData = await res.json();
                setData(json);
            }
        } catch (error) {
            console.error('Failed to fetch stream data:', error);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, POLLING_INTERVAL);
        return () => clearInterval(interval);
    }, []);

    if (!data) {
        return <div className="w-[1450px] h-[140px] bg-black/70 flex items-center justify-center text-white">Loading Overlay...</div>;
    }

    return (
        <div
            className="w-[1450px] h-[140px] flex items-center justify-between px-6"
            style={{
                backgroundColor: 'transparent',
                fontFamily: 'sans-serif',
            }}
        >
            <ScoreDisplay scoreLabel={data.scoreLabel} scoreValue={data.scoreValue} />

            <div className="flex-grow flex items-center justify-end h-full w-full max-w-[1000px]">
                <MessageScroller
                    messages={data.messages}
                    transitionEffect={data.transitionEffect}
                    transitionDuration={data.transitionDuration}
                />
            </div>
        </div>
    );
};

export default ObsOverlayPage;