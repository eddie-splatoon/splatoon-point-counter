'use client';

import {Alert, Box, Button} from '@mui/material';
import axios from 'axios';
import {toBlob} from 'html-to-image';
import React, {useEffect, useRef, useState} from 'react';

import {StreamData} from '../app/api/stream-data/route';
import {SalmonSessionReview} from '../lib/salmonTypes';
import {downloadBlob} from '../lib/weaponCardImage';

import SalmonReview, {REVIEW_SIZES, SalmonReviewLayout} from './SalmonReview';

// オーバーレイの暗幕は半透明なので、画像では不透明な背景を敷く
const IMAGE_BACKGROUND = '#101010';

const LAYOUT_BUTTONS: {layout: SalmonReviewLayout; label: string}[] = [
    {layout: 'landscape', label: '横長（1920×1080）'},
    {layout: 'portrait', label: '縦長（1080×1920）'},
];

const pad2 = (n: number) => String(n).padStart(2, '0');

/** セッションの開始日（無ければ今日）のファイル名。縦長は -vertical を付ける */
export const salmonReviewImageFileName = (review: SalmonSessionReview, layout: SalmonReviewLayout, now: Date = new Date()) => {
    const date = review.session ? new Date(review.session.startedAt) : now;
    const day = `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`;
    return `salmon-review-${day}${layout === 'portrait' ? '-vertical' : ''}.png`;
};

interface Capture {
    review: SalmonSessionReview;
    layout: SalmonReviewLayout;
    fontFamily: string;
}

/**
 * 振り返りを SNS 投稿用の PNG にしてダウンロードする。
 * オーバーレイと同じ見た目にするため、画面外に実寸で描いた振り返りの DOM を html-to-image で画像にする（Canvas で描き直さない）
 */
const SalmonReviewDownload: React.FC<{sessionId?: number}> = ({sessionId}) => {
    const [capture, setCapture] = useState<Capture | null>(null);
    const [downloading, setDownloading] = useState(false);
    const [error, setError] = useState('');
    const nodeRef = useRef<HTMLDivElement>(null);
    // StrictMode で effect が 2 回走っても、1 回の依頼で 2 回ダウンロードしないように
    const handledCapture = useRef<Capture | null>(null);

    const handleDownload = async (layout: SalmonReviewLayout) => {
        setDownloading(true);
        setError('');
        try {
            const [review, fontFamily] = await Promise.all([
                axios.get<SalmonSessionReview>('/api/salmon/review', {params: sessionId ? {sessionId} : {}}).then((res) => res.data),
                // オーバーレイと同じく共通設定のフォントで描く（取れなければ代わりのフォント）
                axios.get<StreamData>('/api/stream-data').then((res) => res.data.fontFamily, () => ''),
            ]);
            setCapture({review, layout, fontFamily});
        } catch {
            setError('振り返りを読み込めませんでした。');
            setDownloading(false);
        }
    };

    // 画面外に描き終えてから画像にする
    useEffect(() => {
        const node = nodeRef.current;
        if (!capture || !node || handledCapture.current === capture) return;
        handledCapture.current = capture;
        const {width, height} = REVIEW_SIZES[capture.layout];
        void (async () => {
            try {
                // 読み込み前のフォントで撮ると代わりのフォントになる
                await document.fonts?.ready;
                const blob = await toBlob(node, {width, height, pixelRatio: 1, backgroundColor: IMAGE_BACKGROUND, cacheBust: true});
                if (!blob) throw new Error('empty image');
                downloadBlob(blob, salmonReviewImageFileName(capture.review, capture.layout));
            } catch {
                setError('画像を作れませんでした。');
            } finally {
                setCapture(null);
                setDownloading(false);
            }
        })();
    }, [capture]);

    return (
        <>
            {error && <Alert severity="error" sx={{mb: 2}}>{error}</Alert>}
            <Box sx={{display: 'flex', gap: 1, flexWrap: 'wrap'}}>
                {LAYOUT_BUTTONS.map(({layout, label}) => (
                    <Button key={layout} variant="contained" onClick={() => handleDownload(layout)} disabled={downloading}>
                        {downloading ? '画像を作成中...' : `${label}をダウンロード`}
                    </Button>
                ))}
            </Box>
            {capture && (
                <div aria-hidden style={{position: 'fixed', left: -100000, top: 0, pointerEvents: 'none'}}>
                    <div ref={nodeRef} style={{...REVIEW_SIZES[capture.layout], fontFamily: capture.fontFamily || 'sans-serif'}}
                         data-testid="salmon-review-capture">
                        <SalmonReview review={capture.review} layout={capture.layout} animate={false}/>
                    </div>
                </div>
            )}
        </>
    );
};

export default SalmonReviewDownload;
