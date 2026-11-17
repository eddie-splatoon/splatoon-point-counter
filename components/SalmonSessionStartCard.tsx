'use client';

import PlayCircleOutlineRoundedIcon from '@mui/icons-material/PlayCircleOutlineRounded';
import {Alert, Box, Button, Paper, TextField, Typography} from '@mui/material';
import axios from 'axios';
import React, {useCallback, useEffect, useState} from 'react';

import {SalmonSummary} from '../lib/salmonTypes';

import {sessionLabel} from './SalmonJobRow';
import SectionTitle from './SectionTitle';

/** 準備の画面の、サーモンランの新しいセッションを始めるカード（「本日」の合計を数え直す） */
const SalmonSessionStartCard: React.FC = () => {
    const [summary, setSummary] = useState<SalmonSummary | null>(null);
    const [title, setTitle] = useState('');
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        try {
            setSummary((await axios.get<SalmonSummary>('/api/salmon')).data);
        } catch {
            setError('サーモンランの記録を読み込めませんでした。サーバーを確認してください。');
        }
    }, []);

    useEffect(() => {
        // マウント時に今のセッションを読み込む
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void load();
    }, [load]);

    const handleStart = async () => {
        setError('');
        try {
            await axios.post('/api/salmon/sessions', {title});
            setTitle('');
            await load();
        } catch {
            setError('セッションの開始に失敗しました。');
        }
    };

    return (
        <Paper sx={{mb: 4, p: 4}}>
            <SectionTitle icon={PlayCircleOutlineRoundedIcon}>サーモンランのセッション</SectionTitle>
            {error && <Alert severity="error" sx={{mb: 2}}>{error}</Alert>}
            <Typography variant="body2" sx={{mb: 2}}>
                今のセッション: {summary ? (summary.session ? `${sessionLabel(summary.session)}（${summary.totals.jobs} 回）` : 'なし（最初の記録で自動作成）') : '読み込み中...'}
            </Typography>
            <Box sx={{display: 'flex', gap: 2, alignItems: 'center'}}>
                <TextField label="新しいセッションのタイトル（任意）" value={title} onChange={(e) => setTitle(e.target.value)} fullWidth/>
                <Button variant="contained" color="success" onClick={handleStart} sx={{minWidth: 200}}>新しいセッションを開始</Button>
            </Box>
            <Typography variant="caption" sx={{display: 'block', mt: 2, color: 'text.secondary'}}>
                配信の開始時に押してください。「本日」の合計は新しいセッションから数え直します。
            </Typography>
        </Paper>
    );
};

export default SalmonSessionStartCard;
