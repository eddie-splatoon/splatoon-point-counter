'use client';

import axios from 'axios';
import React, { useState, useEffect, useCallback } from 'react';

import BurndownChart from '../../components/BurndownChart';
import FireworksEffect from '../../components/FireworksEffect';
import { StreamData } from '../api/stream-data/route';
import '../../components/FireworksEffect.css';

const POLLING_INTERVAL = 2000; // 2秒
const FIREWORKS_DURATION = 20000; // 20秒

const BurndownOverlayPage: React.FC = () => {
    const [data, setData] = useState<StreamData | null>(null);

    const fetchDataInternal = useCallback(async () => {
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
    }, []);

    useEffect(() => {
        fetchDataInternal().catch(error => {
            console.error("Initial data fetch error:", error);
        });
        const interval = setInterval(fetchDataInternal, POLLING_INTERVAL);
        return () => clearInterval(interval);
    }, [fetchDataInternal]);

    const remaining = data ? data.burndown.targetValue - data.burndown.entries.reduce((sum, entry) => sum + entry.score, 0) : 0;
    const hasReachedZero = remaining <= 0;

    // Effect to trigger fireworks via API
    useEffect(() => {
        if (hasReachedZero && data) {
            // Only trigger if lastEvent is not already FIREWORKS or if it has expired
            if (!data.lastEvent || data.lastEvent.name !== 'FIREWORKS' || (Date.now() - data.lastEvent.timestamp) > FIREWORKS_DURATION) {
                axios.post('/api/stream-data', {
                    ...data, // Send current data
                    lastEvent: { name: 'FIREWORKS', timestamp: Date.now() },
                }).catch(error => {
                    console.error('Failed to trigger fireworks:', error);
                });
            }
        }
    }, [hasReachedZero, data]);


    if (!data || !data.burndown) {
        return <div className="w-[250px] h-[584px] bg-black/70 flex items-center justify-center text-white">Loading Burndown...</div>;
    }

    const { burndown, fontFamily } = data;
    
    // Determine if fireworks should be active based on lastEvent and its duration
    const isFireworksActive = data.lastEvent?.name === 'FIREWORKS' && (Date.now() - data.lastEvent.timestamp) < FIREWORKS_DURATION;

    return (
        <div
            className="w-[250px] h-[584px] flex items-center justify-center"
            style={{
                backgroundColor: 'transparent',
                fontFamily: fontFamily || 'sans-serif',
                position: 'relative',
            }}
        >
            <BurndownChart key={data.revision} data={burndown} />
            <FireworksEffect trigger={isFireworksActive} />
        </div>
    );
};

export default BurndownOverlayPage;

