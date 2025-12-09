'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { StreamData } from '../api/stream-data/route';
import BurndownChart from '../../components/BurndownChart';
import FireworksEffect from '../../components/FireworksEffect';
import '../../components/FireworksEffect.css';

const POLLING_INTERVAL = 2000; // 2秒

const BurndownOverlayPage: React.FC = () => {
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

    if (!data || !data.burndown) {
        return <div className="w-[250px] h-[584px] bg-black/70 flex items-center justify-center text-white">Loading Burndown...</div>;
    }

    const { burndown, fontFamily } = data;
    const totalEarned = burndown.entries.reduce((a, b) => a + b, 0);
    const remaining = burndown.targetValue - totalEarned;
    const hasReachedZero = remaining <= 0;

    return (
        <div
            className="w-[250px] h-[584px] flex items-center justify-center"
            style={{
                backgroundColor: 'transparent',
                fontFamily: fontFamily || 'sans-serif',
                position: 'relative',
            }}
        >
            <BurndownChart data={burndown} />
            <FireworksEffect trigger={hasReachedZero} />
        </div>
    );
};

export default BurndownOverlayPage;
