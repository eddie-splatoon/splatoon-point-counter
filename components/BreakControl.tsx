'use client';

import FreeBreakfastRoundedIcon from '@mui/icons-material/FreeBreakfastRounded';
import {Alert, Box, Button, Typography} from '@mui/material';
import {keyframes} from '@mui/material/styles';
import axios from 'axios';
import React, {useCallback, useEffect, useRef, useState} from 'react';

import {tokens} from '../app/control-panel/theme';
import {BREAK_LONG_MS, BreakState, formatBreakElapsed, localBreakStart} from '../lib/breakTypes';

// 声で解除されたときにすぐ戻るよう、オーバーレイと同じ間隔で問い合わせる
const POLLING_INTERVAL = 1000;

// 長い休憩の注意。点滅させて、戻ってきたときに目に入るようにする
const blink = keyframes`
    0%, 100% { opacity: 1; }
    50% { opacity: 0.35; }
`;

export interface BreakView {
    /** 休憩中か */
    active: boolean;
    /** 経過時間（m:ss）。休憩中でなければ空 */
    label: string;
    /** 解除忘れの注意（休憩中に声を拾った・BREAK_LONG_MS を超えた）を出すか */
    needsAttention: boolean;
    voiceHeard: boolean;
    isLong: boolean;
    sending: boolean;
    error: string;
    start: () => void;
    end: () => void;
}

interface Shown {
    /** 休憩を始めた時刻（ブラウザの時計） */
    startedAt: number;
    voiceHeard: boolean;
}

/**
 * 休憩の状態。コントロールパネルの共通の外枠で 1 回だけ使い、ヘッダーのボタン（BreakButton）と帯（BreakBanner）に渡す。
 * 休憩中はタブのタイトルにも出す（別のウインドウを見ていても気づけるように）
 */
export function useBreak(): BreakView {
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
    const voiceHeard = shown?.voiceHeard ?? false;
    const needsAttention = shown !== null && (isLong || voiceHeard);
    const label = shown ? formatBreakElapsed(elapsed) : '';

    useEffect(() => {
        originalTitleRef.current ??= document.title;
        const original = originalTitleRef.current;
        document.title = shown ? `${needsAttention ? '⚠️' : '☕'} 休憩中 ${label} | ${original}` : original;
    }, [shown, needsAttention, label]);
    useEffect(() => () => {
        if (originalTitleRef.current !== null) document.title = originalTitleRef.current;
    }, []);

    return {
        active: shown !== null, label, needsAttention, voiceHeard, isLong, sending, error,
        start: () => void send('start'),
        end: () => void send('end'),
    };
}

const attentionSx = (needsAttention: boolean) => needsAttention ? {animation: `${blink} 1.2s ease-in-out infinite`} : {};

/** ヘッダーの休憩のボタン。休憩していなければ「休憩する」、休憩中は塗りの「休憩を終わる m:ss」 */
export const BreakButton: React.FC<{view: BreakView}> = ({view}) => view.active ? (
    <Button
        variant="contained"
        color={view.needsAttention ? 'error' : 'warning'}
        disabled={view.sending}
        onClick={view.end}
        data-attention={view.needsAttention ? 'true' : 'false'}
        sx={{fontVariantNumeric: 'tabular-nums', ...attentionSx(view.needsAttention)}}
    >
        休憩を終わる {view.label}
    </Button>
) : (
    <Button
        variant="outlined"
        color="warning"
        disabled={view.sending}
        onClick={view.start}
        startIcon={<FreeBreakfastRoundedIcon/>}
        sx={{bgcolor: tokens.color.warningSoft, borderColor: tokens.color.warning, color: tokens.color.warning}}
    >
        休憩する
    </Button>
);

/** 休憩中にヘッダーの下に全幅で出す帯。休憩の操作に失敗したときもここに出す */
export const BreakBanner: React.FC<{view: BreakView}> = ({view}) => (
    <>
        {view.error && <Alert severity="error" sx={{borderRadius: 0}}>{view.error}</Alert>}
        {view.active && (
            <Box
                data-testid="break-active"
                data-attention={view.needsAttention ? 'true' : 'false'}
                role="status"
                sx={{
                    px: 5, py: 2, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 3,
                    bgcolor: view.needsAttention ? tokens.color.error : tokens.color.warning,
                    color: view.needsAttention ? tokens.color.onError : tokens.color.onWarning,
                    ...attentionSx(view.needsAttention),
                }}
            >
                <Typography sx={{fontWeight: 700, fontVariantNumeric: 'tabular-nums'}}>
                    休憩中 {view.label}
                </Typography>
                <Typography variant="body2" sx={{color: 'inherit'}}>
                    {view.voiceHeard
                        ? '休憩中に話し声を拾いました。戻っていたら休憩を終わってください'
                        : view.isLong
                            ? `${BREAK_LONG_MS / 60000} 分を超えました。戻っていたら休憩を終わってください`
                            : '―「ただいま」と話すか、右上のボタンで終わります'}
                </Typography>
            </Box>
        )}
    </>
);
