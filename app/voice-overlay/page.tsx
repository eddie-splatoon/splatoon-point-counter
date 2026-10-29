'use client';

import axios from 'axios';
import React, {useCallback, useEffect, useRef} from 'react';

import {SpeechData} from '../../lib/voiceTypes';

const POLLING_INTERVAL = 500;

/** 1件を再生し、終わったら resolve する。音声が作れなかった（VOICEVOX 未起動など）ときも止まらずに次へ進めるよう resolve する */
const playSpeech = (id: number) => new Promise<void>((resolve) => {
    const audio = new Audio(`/api/speech/audio?id=${id}`);
    audio.onended = () => resolve();
    audio.onerror = () => resolve();
    audio.play().catch((error) => {
        console.error('Failed to play speech:', error);
        resolve();
    });
});

/**
 * 音声専用のオーバーレイ（画面には何も出さない）。読み上げキューを問い合わせ、まだ再生していないものを1件ずつ順に再生する。
 * OBS では「OBS で音声を制御する」を ON にしたブラウザソースとして追加する
 */
const VoiceOverlayPage: React.FC = () => {
    // 再生済み（または開いた時点でキューにあった）ID。null は初回の取得前
    const seen = useRef<Set<number> | null>(null);
    const pending = useRef<number[]>([]);
    const playing = useRef(false);

    // 待っているものを1件ずつ順に再生する（重ねて再生しない）
    const playPending = useCallback(async () => {
        if (playing.current) return;
        playing.current = true;
        try {
            for (let id = pending.current.shift(); id !== undefined; id = pending.current.shift()) {
                await playSpeech(id);
            }
        } finally {
            playing.current = false;
        }
    }, []);

    const fetchDataInternal = useCallback(async () => {
        try {
            const res = await axios.get<SpeechData>('/api/speech', {
                headers: {
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache',
                    'Expires': '0',
                },
            });
            if (res.status !== 200) return;
            const ids = res.data.items.map((item) => item.id);
            if (seen.current === null) {
                // 開いた時点でキューにあるもの（オーバーレイの再読み込み時など）は再生しない
                seen.current = new Set(ids);
                return;
            }
            for (const id of ids) {
                if (seen.current.has(id)) continue;
                seen.current.add(id);
                pending.current.push(id);
            }
            void playPending();
        } catch (error) {
            console.error('Failed to fetch speech queue:', error);
        }
    }, [playPending]);

    useEffect(() => {
        void fetchDataInternal();
        const interval = setInterval(fetchDataInternal, POLLING_INTERVAL);
        return () => clearInterval(interval);
    }, [fetchDataInternal]);

    return <div className="w-screen h-screen" style={{backgroundColor: 'transparent'}} data-testid="voice-overlay"/>;
};

export default VoiceOverlayPage;
