'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import ScoreDisplay from '../../components/ScoreDisplay';
import MessageScroller from '../../components/MessageScroller';
import RandomTipScroller from '../../components/RandomTipScroller';
import HeartEffect from '../../components/HeartEffect'; // HeartEffectをインポート
import { StreamData } from '../api/stream-data/route';

const POLLING_INTERVAL = 2000; // 2秒

const ObsOverlayPage: React.FC = () => {
    const [data, setData] = useState<StreamData | null>(null);

    useEffect(() => {
        const fetchDataInternal = async () => {
            try {
                const res = await axios.get<StreamData>('/api/stream-data', {
                    headers: {
                        'Cache-Control': 'no-cache',
                        'Pragma': 'no-cache',
                        'Expires': '0',
                    },
                });
                if (res.status === 200) {
                    const json = res.data;
                    setData(json);
                }
            } catch (error) {
                console.error('Failed to fetch stream data:', error);
            }
        };

        fetchDataInternal().catch(error => {
            console.error("Initial data fetch error:", error);
        });
        const interval = setInterval(fetchDataInternal, POLLING_INTERVAL);
        return () => clearInterval(interval);
    }, []);

    if (!data) {
        return <div className="w-[1450px] h-[200px] bg-black/70 flex items-center justify-center text-white">Loading Overlay...</div>;
    }

    const activePreset = data.messagePresets.find(p => p.name === data.activePresetName);
    const activeMessages = activePreset ? activePreset.messages : [];

    return (
        <div
            className="w-[1450px] h-[200px] flex items-center justify-between px-6"
            style={{
                backgroundColor: 'transparent',
                fontFamily: data.fontFamily || 'sans-serif',
                position: 'relative', // エフェクトの親要素として機能させる
            }}
        >
            <HeartEffect trigger={data.lastEvent?.name === 'LOVE' ? data.lastEvent.timestamp : undefined} />

            <ScoreDisplay scoreLabel={data.scoreLabel} scoreValue={data.scoreValue} fontSize={data.fontSize} />
            
            <div className="flex flex-col justify-center h-full w-full max-w-[1000px]">
                <MessageScroller
                    messages={activeMessages}
                    transitionEffect={data.transitionEffect}
                    transitionDuration={data.transitionDuration}
                    fontSize={data.fontSize}
                />
                <RandomTipScroller
                    fontSize={18}
                    intervalSeconds={15}
                />
            </div>
        </div>
    );
};

export default ObsOverlayPage;