'use client';

import axios from 'axios';
import React, {useCallback, useEffect, useState} from 'react';

import {StreamData} from '../app/api/stream-data/route';
import {SalmonSessionReview} from '../lib/salmonTypes';

import SalmonReview, {SalmonReviewLayout} from './SalmonReview';

const POLLING_INTERVAL = 5000; // 5秒（配信の最後に出すだけなので、こまめに取らなくてよい）
const NO_CACHE_HEADERS = {'Cache-Control': 'no-cache', 'Pragma': 'no-cache', 'Expires': '0'};

/** 振り返りのオーバーレイの本体（配信画面用と縦型配信用の 2 つのページで共通） */
const SalmonReviewOverlay: React.FC<{layout: SalmonReviewLayout}> = ({layout}) => {
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
            {review && <SalmonReview review={review} layout={layout}/>}
        </div>
    );
};

export default SalmonReviewOverlay;
