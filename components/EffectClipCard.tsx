'use client';

import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import BubbleChartRoundedIcon from '@mui/icons-material/BubbleChartRounded';
import FavoriteBorderRoundedIcon from '@mui/icons-material/FavoriteBorderRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import StarOutlineRoundedIcon from '@mui/icons-material/StarOutlineRounded';
import VideocamRoundedIcon from '@mui/icons-material/VideocamRounded';
import {Box, Button, ButtonBase, Typography} from '@mui/material';
import axios from 'axios';
import React, {useEffect, useRef, useState} from 'react';

import {tokens} from '../app/control-panel/theme';

import ClipHistory from './ClipHistory';
import LiveCard, {LiveCardNote} from './LiveCard';
import LiveDialog from './LiveDialog';

import type {SvgIconComponent} from '@mui/icons-material';

const EFFECTS: {name: string; label: string; icon: SvgIconComponent; color: string}[] = [
    {name: 'LOVE', label: 'LOVE', icon: FavoriteBorderRoundedIcon, color: '#FF7AA8'},
    {name: 'STAR', label: 'STAR', icon: StarOutlineRoundedIcon, color: tokens.color.gold},
    {name: 'SPARKLE', label: 'SPARKLE', icon: AutoAwesomeRoundedIcon, color: '#9FD8FF'},
    {name: 'BUBBLE', label: 'BUBBLE', icon: BubbleChartRoundedIcon, color: '#7FE3B0'},
];

// 送れた・送れなかったを出しておく時間
const STATUS_MS = 2000;

const TileButton: React.FC<{label: string; icon: SvgIconComponent; color: string; clip?: boolean; disabled?: boolean; onClick: () => void}> = (
    {label, icon: Icon, color, clip = false, disabled = false, onClick},
) => (
    <ButtonBase
        onClick={onClick}
        disabled={disabled}
        sx={{
            flexDirection: 'column', gap: 1, height: tokens.height.hero, borderRadius: `${tokens.radius.control}px`,
            border: '1px solid', borderColor: clip ? '#5B3346' : 'divider', bgcolor: clip ? tokens.color.primarySoft : '#1B1F27',
            color, fontSize: 11, fontWeight: 600, '&:hover': {filter: 'brightness(1.15)'}, '&.Mui-disabled': {opacity: 0.5},
            '&.Mui-focusVisible': {outline: `2px solid ${tokens.color.primary}`, outlineOffset: 2},
        }}
    >
        <Icon sx={{fontSize: 22}} aria-hidden/>
        {label}
    </ButtonBase>
);

/** 配信中の画面のエフェクト（PATCH /api/stream-data {event}）とクリップ（POST /api/clip）のボタン。クリップの履歴はダイアログで開く */
const EffectClipCard: React.FC = () => {
    const [sending, setSending] = useState(false);
    const [status, setStatus] = useState<{ok: boolean; text: string} | null>(null);
    const [historyOpen, setHistoryOpen] = useState(false);
    const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => () => {
        if (statusTimer.current) clearTimeout(statusTimer.current);
    }, []);

    const report = (ok: boolean, text: string) => {
        if (statusTimer.current) clearTimeout(statusTimer.current);
        setStatus({ok, text});
        statusTimer.current = setTimeout(() => setStatus(null), STATUS_MS);
    };

    const trigger = async (name: string) => {
        if (sending) return;
        setSending(true);
        try {
            await axios.patch('/api/stream-data', {event: name});
            report(true, `${name} を出しました`);
        } catch {
            report(false, 'エフェクトを出せませんでした');
        } finally {
            setSending(false);
        }
    };

    const requestClip = async () => {
        try {
            await axios.post('/api/clip', {source: 'button'});
            report(true, 'クリップを依頼しました（できたらテロップで知らせます）');
        } catch {
            report(false, 'クリップを依頼できませんでした。');
        }
    };

    return (
        <LiveCard
            icon={AutoAwesomeRoundedIcon}
            title="エフェクト・クリップ"
            aside={(
                <Box sx={{display: 'flex', alignItems: 'center', gap: 2}}>
                    <LiveCardNote>声でも出せます</LiveCardNote>
                    <Button size="small" startIcon={<HistoryRoundedIcon/>} onClick={() => setHistoryOpen(true)} sx={{minHeight: 32}}>履歴</Button>
                </Box>
            )}
        >
            <Box sx={{display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 2}}>
                {EFFECTS.map(({name, label, icon, color}) => (
                    <TileButton key={name} label={label} icon={icon} color={color} disabled={sending} onClick={() => void trigger(name)}/>
                ))}
                <TileButton label="クリップ" icon={VideocamRoundedIcon} color="#FFB3CD" clip onClick={() => void requestClip()}/>
            </Box>
            <Typography role="status" variant="caption" sx={{display: 'block', mt: 1.5, minHeight: 18, color: status?.ok === false ? 'error.main' : 'text.secondary'}}>
                {status?.text}
            </Typography>

            <LiveDialog open={historyOpen} onClose={() => setHistoryOpen(false)} title="クリップの履歴">
                <Typography variant="body2" sx={{mb: 2, color: 'text.secondary'}}>
                    配信中に「クリップ撮って」「今のクリップ」などと言っても作れます（文字起こし <code>pnpm caption</code> と Twitch 連携 <code>pnpm twitch</code> を起動しておく）。
                </Typography>
                {historyOpen && <ClipHistory/>}
            </LiveDialog>
        </LiveCard>
    );
};

export default EffectClipCard;
