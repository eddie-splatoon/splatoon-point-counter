'use client';

import axios from 'axios';
import React, {useCallback, useEffect, useState} from 'react';

import {StreamData} from '../app/api/stream-data/route';
import {VoiceSettings, voiceCredit} from '../lib/voiceTypes';

// 話者・フォントは配信中にほとんど変えないので、ゆっくり問い合わせる
const POLLING_INTERVAL = 5000;
const NO_CACHE = {'Cache-Control': 'no-cache', 'Pragma': 'no-cache', 'Expires': '0'};

export type VoiceCreditLayout = 'landscape' | 'portrait';

// 置き方（オーバーレイでの px）。目立たせない（概要欄などにも書いている）ので、左下の角に小さく出す。
// landscape（1920x1080）: 左下のスコア表示（y 〜1053 付近）の下の余白。portrait（1080x1920）: 左下のロゴの下の余白
const LAYOUT_STYLES: Record<VoiceCreditLayout, {left: number; bottom: number; fontSize: number}> = {
    landscape: {left: 24, bottom: 4, fontSize: 18},
    portrait: {left: 24, bottom: 8, fontSize: 20},
};

interface VoiceCreditOverlayProps {
    layout: VoiceCreditLayout;
}

/**
 * VOICEVOX のクレジット（例: VOICEVOX:ずんだもん）を常に小さく出す。/voice-credit-overlay（横長）と /voice-credit-overlay/vertical（縦型配信用）で共通。
 * ほかの表示になじむよう、共通設定のフォントで、帯を付けずに少し透かして出す
 */
const VoiceCreditOverlay: React.FC<VoiceCreditOverlayProps> = ({layout}) => {
    const [credit, setCredit] = useState<string | null>(null);
    const [fontFamily, setFontFamily] = useState('');
    const style = LAYOUT_STYLES[layout];

    const fetchSettings = useCallback(async () => {
        try {
            const {data} = await axios.get<VoiceSettings>('/api/voice', {headers: NO_CACHE});
            setCredit(data.showCredit && data.speakerName ? voiceCredit(data.speakerName) : null);
        } catch (error) {
            // 取れなければ直前の表示のまま（クレジットを消さない）
            console.error('Failed to fetch voice settings:', error);
        }
        try {
            const {data} = await axios.get<StreamData>('/api/stream-data', {headers: NO_CACHE});
            setFontFamily(data.fontFamily);
        } catch (error) {
            console.error('Failed to fetch font setting:', error);
        }
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void fetchSettings();
        const interval = setInterval(fetchSettings, POLLING_INTERVAL);
        return () => clearInterval(interval);
    }, [fetchSettings]);

    return (
        <div data-testid="voice-credit-area" data-layout={layout} className="relative w-screen h-screen overflow-hidden" style={{backgroundColor: 'transparent'}}>
            {credit && (
                <div
                    data-testid="voice-credit"
                    className="absolute text-white whitespace-nowrap"
                    style={{
                        left: style.left,
                        bottom: style.bottom,
                        fontSize: style.fontSize,
                        lineHeight: 1.2,
                        fontFamily: fontFamily || 'sans-serif',
                        opacity: 0.75,
                        // 帯は付けないので、明るい背景でも読めるよう縁取りの影だけ付ける
                        textShadow: '0 0 3px rgba(0, 0, 0, 0.9), 1px 1px 2px rgba(0, 0, 0, 0.9)',
                    }}
                >
                    {credit}
                </div>
            )}
        </div>
    );
};

export default VoiceCreditOverlay;
