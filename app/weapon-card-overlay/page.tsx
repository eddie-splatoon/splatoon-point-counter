'use client';

import axios from 'axios';
import React, {useCallback, useEffect, useState} from 'react';

import WeaponCard from '../../components/WeaponCard';
import {WeaponCard as WeaponCardData} from '../../lib/salmonWeapons';
import {StreamData} from '../api/stream-data/route';

const POLLING_INTERVAL = 2000; // 2秒
const NO_CACHE_HEADERS = {'Cache-Control': 'no-cache', 'Pragma': 'no-cache', 'Expires': '0'};

/** オールランダムのブキ埋めカード。サーモンランタブで記録したブキ・ブキ埋めタブで埋めたブキを表示する */
const WeaponCardOverlayPage: React.FC = () => {
    const [card, setCard] = useState<WeaponCardData | null>(null);
    const [fontFamily, setFontFamily] = useState('');

    const fetchData = useCallback(async () => {
        // フォントが取れなくてもカードは表示し続ける
        const [cardRes, streamRes] = await Promise.allSettled([
            axios.get<WeaponCardData>('/api/weapon-card', {headers: NO_CACHE_HEADERS}),
            axios.get<StreamData>('/api/stream-data', {headers: NO_CACHE_HEADERS}),
        ]);
        if (cardRes.status === 'fulfilled') setCard(cardRes.value.data);
        if (streamRes.status === 'fulfilled') setFontFamily(streamRes.value.data.fontFamily);
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void fetchData();
        const interval = setInterval(fetchData, POLLING_INTERVAL);
        return () => clearInterval(interval);
    }, [fetchData]);

    return (
        <div className="inline-block p-2" style={{backgroundColor: 'transparent', fontFamily: fontFamily || 'sans-serif'}}>
            {card && <WeaponCard card={card}/>}
        </div>
    );
};

export default WeaponCardOverlayPage;
