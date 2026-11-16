'use client';

import axios from 'axios';
import React, {useCallback, useEffect, useState} from 'react';

import {JOIN_HOW_TO, JoinQueuePublicView, formatRoomHazard} from '../../lib/joinQueueTypes';
import {StreamData} from '../api/stream-data/route';

const POLLING_INTERVAL = 1000;
const NO_CACHE_HEADERS = {'Cache-Control': 'no-cache', 'Pragma': 'no-cache', 'Expires': '0'};

/**
 * 視聴者参加型の受付（420x600）。受付中だけ、書き方・部屋の推定キケン度・いまの人・列（番号・表示名）を出す。
 * 個人の評価は出さない（配信者の手元だけ）。
 * 表示名は React の描画（textContent 相当）で出す
 */
const JoinQueueOverlayPage: React.FC = () => {
    const [queue, setQueue] = useState<JoinQueuePublicView | null>(null);
    const [fontFamily, setFontFamily] = useState('');

    const fetchData = useCallback(async () => {
        // フォントが取れなくても列は表示し続ける
        const [queueRes, streamRes] = await Promise.allSettled([
            axios.get<JoinQueuePublicView>('/api/join-queue', {headers: NO_CACHE_HEADERS}),
            axios.get<StreamData>('/api/stream-data', {headers: NO_CACHE_HEADERS}),
        ]);
        if (queueRes.status === 'fulfilled') setQueue(queueRes.value.data);
        if (streamRes.status === 'fulfilled') setFontFamily(streamRes.value.data.fontFamily);
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void fetchData();
        const interval = setInterval(fetchData, POLLING_INTERVAL);
        return () => clearInterval(interval);
    }, [fetchData]);

    return (
        <div style={{width: 420, height: 600, backgroundColor: 'transparent', fontFamily: fontFamily || 'sans-serif'}}>
            {queue?.open && (
                <section aria-label="参加受付" className="m-2 rounded-xl border border-white/20 bg-black/70 p-4 text-white">
                    <h1 className="text-2xl font-bold">🙋 参加受付中</h1>
                    <p className="mt-1 text-sm text-white/80">チャットに {JOIN_HOW_TO}</p>
                    {queue.hazard && <p className="mt-3 text-base font-bold text-orange-300">{formatRoomHazard(queue.hazard)}</p>}
                    {queue.current && (
                        <p className="mt-3 rounded-lg bg-yellow-400/20 px-3 py-2 text-lg">
                            いまの人: <span className="font-bold">{queue.current}</span> さん
                        </p>
                    )}
                    {queue.entries.length === 0 ? (
                        <p className="mt-3 text-white/70">まだ誰も並んでいません</p>
                    ) : (
                        <ol aria-label="受付の列" className="mt-3 space-y-1 text-lg">
                            {queue.entries.slice(0, 10).map((entry) => (
                                <li key={entry.position} className="truncate">
                                    <span className="mr-2 tabular-nums text-white/70">{entry.position}.</span>{entry.userName} さん
                                </li>
                            ))}
                            {queue.entries.length > 10 && <li className="text-white/70">ほか {queue.entries.length - 10} 人</li>}
                        </ol>
                    )}
                </section>
            )}
        </div>
    );
};

export default JoinQueueOverlayPage;
