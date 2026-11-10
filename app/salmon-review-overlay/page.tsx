'use client';

import axios from 'axios';
import React, {useCallback, useEffect, useState} from 'react';

import SalmonReview from '../../components/SalmonReview';
import {SalmonSessionReview} from '../../lib/salmonTypes';
import {StreamData} from '../api/stream-data/route';

const POLLING_INTERVAL = 5000; // 5秒（配信の最後に出すだけなので、こまめに取らなくてよい）
const NO_CACHE_HEADERS = {'Cache-Control': 'no-cache', 'Pragma': 'no-cache', 'Expires': '0'};

/** 配信の最後に、その日のサーモンランの記録を大きく出す振り返り（1920×1080） */
const SalmonReviewOverlayPage: React.FC = () => {
    const [review, setReview] = useState<SalmonSessionReview | null>(null);
    const [fontFamily, setFontFamily] = useState('');

    const fetchData = useCallback(async () => {
        // フォントが取れなくても振り返りは表示し続ける
        const [reviewRes, streamRes] = await Promise.allSettled([
            axios.get<SalmonSessionReview>('/api/salmon/review', {headers: NO_CACHE_HEADERS}),
            axios.get<StreamData>('/api/stream-data', {headers: NO_CACHE_HEADERS}),
        ]);
        if (reviewRes.status === 'fulfilled') setReview(reviewRes.value.data);
        if (streamRes.status === 'fulfilled') setFontFamily(streamRes.value.data.fontFamily);
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void fetchData();
        const interval = setInterval(fetchData, POLLING_INTERVAL);
        return () => clearInterval(interval);
    }, [fetchData]);

    return (
        <div style={{backgroundColor: 'transparent', fontFamily: fontFamily || 'sans-serif'}}>
            {review && <SalmonReview review={review}/>}
        </div>
    );
};

export default SalmonReviewOverlayPage;
