'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios'; // axiosをインポート
import ScoreDisplay from '../../components/ScoreDisplay';
import MessageScroller from '../../components/MessageScroller';
import { StreamData } from '../api/stream-data/route';

const POLLING_INTERVAL = 2000; // 2秒

const ObsOverlayPage: React.FC = () => {
    const [data, setData] = useState<StreamData | null>(null);

    useEffect(() => {
        const fetchDataInternal = async () => {
            try {
                // axios.getを使用してデータを取得し、キャッシュを無効化
                const res = await axios.get<StreamData>('/api/stream-data', {
                    headers: {
                        'Cache-Control': 'no-cache',
                        'Pragma': 'no-cache',
                        'Expires': '0',
                    },
                });
                if (res.status === 200) {
                    const json = res.data;
                    //console.log('OBS Overlay: Fetched data', json); // データ取得のログを追加
                    setData(json);
                }
            } catch (error) {
                console.error('Failed to fetch stream data:', error);
            }
        };

        fetchDataInternal().catch(error => {
            console.error("Initial data fetch error:", error);
        }); // 初回データ取得とエラーハンドリング
        const interval = setInterval(fetchDataInternal, POLLING_INTERVAL); // 以降のポーリング
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