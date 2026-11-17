'use client';

import {Alert, Box, Button, Typography} from '@mui/material';
import {keyframes} from '@mui/material/styles';
import axios from 'axios';
import React, {useCallback, useEffect, useRef, useState} from 'react';

import {BREAK_LONG_MS, BreakState, formatBreakElapsed, localBreakStart} from '../lib/breakTypes';

// 声で解除されたときにすぐ戻るよう、オーバーレイと同じ間隔で問い合わせる
const POLLING_INTERVAL = 1000;

// 長い休憩の注意。点滅させて、戻ってきたときに目に入るようにする
const blink = keyframes`
    0%, 100% { opacity: 1; }
    50% { opacity: 0.35; }
`;

interface Shown {
    /** 休憩を始めた時刻（ブラウザの時計） */
    startedAt: number;
    voiceHeard: boolean;
}

/**
 * コントロールパネル上部（テロップバー）の「休憩する」ボタン。休憩中は経過時間と「休憩を終わる」を目立たせ、
 * 解除忘れ（休憩中に声を拾った・BREAK_LONG_MS を超えた）を注意する。タブのタイトルにも出す
 */
const BreakControl: React.FC = () => {
    const [shown, setShown] = useState<Shown | null>(null);
    const [now, setNow] = useState(0);
    const [error, setError] = useState('');
    const [sending, setSending] = useState(false);
    const originalTitleRef = useRef<string | null>(null);

    const apply = useCallback((state: BreakState | undefined) => {
        const startedAt = localBreakStart(state);
        setShown(startedAt === null ? null : {startedAt, voiceHeard: state?.voiceHeardAt != null});
        setNow(Date.now());
    }, []);

    const fetchState = useCallback(async () => {
        try {
            const res = await axios.get<BreakState>('/api/break', {headers: {'Cache-Control': 'no-cache'}});
            apply(res.data);
        } catch (e) {
            // 取れなければ直前の表示のまま（経過時間だけ進める）
            console.error('Failed to fetch break state:', e);
            setNow(Date.now());
        }
    }, [apply]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void fetchState();
        const interval = setInterval(fetchState, POLLING_INTERVAL);
        return () => clearInterval(interval);
    }, [fetchState]);

    const send = useCallback(async (action: 'start' | 'end') => {
        setSending(true);
        setError('');
        try {
            const res = await axios.post<BreakState>('/api/break', {action});
            apply(res.data);
        } catch {
            setError(action === 'start' ? '休憩中にできませんでした。' : '休憩を終われませんでした。');
        } finally {
            setSending(false);
        }
    }, [apply]);

    const elapsed = shown ? now - shown.startedAt : 0;
    const isLong = shown !== null && elapsed >= BREAK_LONG_MS;
    const needsAttention = shown !== null && (isLong || shown.voiceHeard);
    const label = shown ? formatBreakElapsed(elapsed) : '';

    // 別のウインドウを見ていても気づけるよう、休憩中はタブのタイトルにも出す
    useEffect(() => {
        originalTitleRef.current ??= document.title;
        const original = originalTitleRef.current;
        document.title = shown ? `${needsAttention ? '⚠️' : '☕'} 休憩中 ${label} | ${original}` : original;
    }, [shown, needsAttention, label]);
    useEffect(() => () => {
        if (originalTitleRef.current !== null) document.title = originalTitleRef.current;
    }, []);

    return (
        <Box data-testid="break-control" sx={{mb: 1}}>
            {error && <Alert severity="error" sx={{mb: 1}}>{error}</Alert>}
            {shown ? (
                <Box
                    data-testid="break-active"
                    data-attention={needsAttention ? 'true' : 'false'}
                    sx={{
                        display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5, p: 1, borderRadius: 1,
                        bgcolor: needsAttention ? '#C62828' : '#E65100',
                        animation: needsAttention ? `${blink} 1.2s ease-in-out infinite` : 'none',
                    }}
                >
                    <Typography sx={{fontWeight: 'bold', color: '#fff', fontVariantNumeric: 'tabular-nums'}}>
                        ☕ 休憩中 {label}（配信画面に表示中）
                    </Typography>
                    <Button variant="contained" size="small" color="inherit" disabled={sending} onClick={() => void send('end')} sx={{color: '#000'}}>
                        休憩を終わる
                    </Button>
                    {shown.voiceHeard && (
                        <Typography variant="body2" sx={{color: '#fff'}}>休憩中に話し声を拾いました。戻っていたら休憩を終わってください</Typography>
                    )}
                    {isLong && !shown.voiceHeard && (
                        <Typography variant="body2" sx={{color: '#fff'}}>{BREAK_LONG_MS / 60000} 分を超えました。戻っていたら休憩を終わってください</Typography>
                    )}
                </Box>
            ) : (
                <Button variant="outlined" size="small" color="warning" disabled={sending} onClick={() => void send('start')}>
                    ☕ 休憩する
                </Button>
            )}
        </Box>
    );
};

export default BreakControl;
