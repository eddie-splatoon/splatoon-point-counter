'use client';

import {Alert, Button, Paper, TextField, Typography} from '@mui/material';
import {alpha} from '@mui/material/styles';
import axios from 'axios';
import {useRouter} from 'next/navigation';
import React, {useCallback, useEffect, useId, useState} from 'react';

import {tokens} from '../app/control-panel/theme';
import {SalmonSummary} from '../lib/salmonTypes';

import {sessionLabel} from './SalmonJobRow';

/**
 * 準備の画面の「今日の配信」。「配信を始める」でサーモンランの新しいセッションを始め（「本日」の合計を 0 から数え直す）、
 * そのまま配信中の画面に移る
 */
const StreamStartCard: React.FC = () => {
    const router = useRouter();
    const headingId = useId();
    const [summary, setSummary] = useState<SalmonSummary | null>(null);
    const [title, setTitle] = useState('');
    const [starting, setStarting] = useState(false);
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
        setStarting(true);
        try {
            await axios.post('/api/salmon/sessions', {title});
            router.push('/control-panel');
        } catch {
            setError('配信を始められませんでした（セッションを作れませんでした）。');
            setStarting(false);
        }
    };

    const current = summary
        ? (summary.session ? `${sessionLabel(summary.session)}（${summary.totals.jobs} バイト）` : 'なし（最初の記録で作ります）')
        : '読み込み中...';

    return (
        <Paper
            component="section"
            aria-labelledby={headingId}
            sx={{p: 5, bgcolor: tokens.color.primarySoft, borderColor: alpha(tokens.color.primary, 0.35)}}
        >
            <Typography id={headingId} variant="h2" sx={{fontSize: 18, mb: 1}}>今日の配信</Typography>
            <Typography variant="body2" sx={{color: 'text.secondary', mb: 3.5}}>
                始めると新しいセッションを作り、「本日」の合計を 0 から数え直して、配信中の画面に移ります。
            </Typography>
            {error && <Alert severity="error" sx={{mb: 3}}>{error}</Alert>}
            <TextField
                label="セッションのタイトル（任意）"
                placeholder="例: 夜のバイト"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                fullWidth
            />
            <Button
                variant="contained"
                fullWidth
                onClick={handleStart}
                disabled={starting}
                sx={{mt: 3, height: tokens.height.live, borderRadius: `${tokens.radius.primary}px`, fontSize: 16}}
            >
                配信を始める
            </Button>
            <Typography variant="caption" sx={{display: 'block', mt: 2}}>いまのセッション: {current}</Typography>
        </Paper>
    );
};

export default StreamStartCard;
