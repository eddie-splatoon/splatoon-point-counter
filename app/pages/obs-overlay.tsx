import React, { useState, useEffect } from 'react';
import ScoreDisplay from '../components/ScoreDisplay';
import MessageScroller from '../components/MessageScroller';
import { StreamData } from './api/stream-data'; // APIの型定義を利用

// ポーリング間隔（ms）
const POLLING_INTERVAL = 2000; // 2秒

const ObsOverlay: React.FC = () => {
    const [data, setData] = useState<StreamData | null>(null);

    // APIからデータを取得する関数
    const fetchData = async () => {
        try {
            const res = await fetch('/api/stream-data');
            if (res.ok) {
                const json: StreamData = await res.json();
                setData(json);
            }
        } catch (error) {
            console.error('Failed to fetch stream data:', error);
        }
    };

    // 定期的なポーリング (データ取得)
    useEffect(() => {
        fetchData(); // 初回ロード時
        const interval = setInterval(fetchData, POLLING_INTERVAL);
        return () => clearInterval(interval); // クリーンアップ
    }, []);

    if (!data) {
        return <div className="w-[1450px] h-[140px] bg-black/70 flex items-center justify-center text-white">Loading...</div>;
    }

    return (
        // OBSの背景透過のため、全体を透明にする
        // OBSのカスタムCSSで 'background: transparent !important;' を設定推奨
        <div
            className="w-[1450px] h-[140px] flex items-center justify-between p-4"
            style={{
                backgroundColor: 'transparent',
                fontFamily: 'sans-serif',
            }}
        >
            {/* スコア表示 */}
            <ScoreDisplay scoreLabel={data.scoreLabel} scoreValue={data.scoreValue} />

            {/* メッセージ表示 (残りスペースを使用) */}
            <div className="flex-grow flex items-center justify-end h-full">
                <MessageScroller
                    messages={data.messages}
                    transitionEffect={data.transitionEffect}
                    transitionDuration={data.transitionDuration}
                />
            </div>
        </div>
    );
};

export default ObsOverlay;