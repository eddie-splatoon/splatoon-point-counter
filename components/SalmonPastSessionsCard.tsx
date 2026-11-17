'use client';

import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import ImageRoundedIcon from '@mui/icons-material/ImageRounded';
import {Alert, Box, FormControl, InputLabel, MenuItem, Paper, Select, Typography} from '@mui/material';
import axios from 'axios';
import React, {useEffect, useRef, useState} from 'react';

import {SalmonSessionWithTotals, SalmonSummary} from '../lib/salmonTypes';

import {JobRow, salmonListSx, sessionLabel} from './SalmonJobRow';
import SalmonReviewDownload from './SalmonReviewDownload';
import SalmonStats from './SalmonStats';
import SectionTitle from './SectionTitle';

const paperSx = {mb: 4, p: 4};

/** 振り返りの画面の、サーモンランの過去のセッションと振り返りの画像（選んだセッション。選ばなければ今のセッション） */
const SalmonPastSessionsCard: React.FC = () => {
    const [currentSessionId, setCurrentSessionId] = useState<number | undefined>(undefined);
    const [sessions, setSessions] = useState<SalmonSessionWithTotals[] | null>(null);
    const [pastSessionId, setPastSessionId] = useState<number | ''>('');
    const [pastSummary, setPastSummary] = useState<SalmonSummary | null>(null);
    const [error, setError] = useState('');
    // 素早く切り替えたとき、古い応答で表示を上書きしないための最新の選択
    const latestPastSessionId = useRef<number | ''>('');

    useEffect(() => {
        let active = true;
        Promise.all([axios.get<SalmonSummary>('/api/salmon'), axios.get<SalmonSessionWithTotals[]>('/api/salmon/sessions')])
            .then(([summary, list]) => {
                if (!active) return;
                setCurrentSessionId(summary.data.session?.id);
                setSessions(list.data);
            })
            .catch(() => active && setError('セッションの一覧を読み込めませんでした。サーバーを確認してください。'));
        return () => {
            active = false;
        };
    }, []);

    const handleSelect = async (id: number | '') => {
        latestPastSessionId.current = id;
        setPastSessionId(id);
        setPastSummary(null);
        if (id === '') return;
        try {
            const res = await axios.get<SalmonSummary>(`/api/salmon?sessionId=${id}`);
            if (latestPastSessionId.current === id) setPastSummary(res.data);
        } catch {
            if (latestPastSessionId.current === id) setError('セッションの読み込みに失敗しました。');
        }
    };

    const pastSessions = (sessions ?? []).filter((s) => s.id !== currentSessionId);

    return (
        <>
            {error && <Alert severity="error" sx={{mb: 2}}>{error}</Alert>}
            <Paper sx={paperSx}>
                <SectionTitle icon={HistoryRoundedIcon}>サーモンランの過去のセッション</SectionTitle>
                <FormControl fullWidth margin="normal">
                    <InputLabel id="salmon-past-session-label">セッションを選択</InputLabel>
                    <Select
                        labelId="salmon-past-session-label"
                        label="セッションを選択"
                        value={pastSessionId}
                        onChange={(e) => handleSelect(e.target.value as number | '')}
                    >
                        <MenuItem value="">選択しない</MenuItem>
                        {pastSessions.map((s) => (
                            <MenuItem key={s.id} value={s.id}>
                                {sessionLabel(s)}（{s.totals.jobs}回 / 金イクラ {s.totals.goldenEggs}）
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
                {sessions && pastSessions.length === 0 && (
                    <Typography variant="body2" sx={{color: 'text.secondary'}}>過去のセッションはまだありません</Typography>
                )}
                {pastSummary && (
                    <Box sx={{display: 'flex', gap: 2, alignItems: 'flex-start', flexWrap: 'wrap', mt: 1}}>
                        <SalmonStats lastJob={pastSummary.lastJob} totals={pastSummary.totals} title="セッションの戦績"/>
                        <Box data-testid="salmon-past-history" sx={{...salmonListSx, flex: 1, minWidth: 260}}>
                            {pastSummary.jobs.map((job, i) => (
                                <JobRow key={job.id} job={job} index={pastSummary.jobs.length - i}/>
                            ))}
                        </Box>
                    </Box>
                )}
            </Paper>

            <Paper sx={paperSx}>
                <SectionTitle icon={ImageRoundedIcon}>サーモンランの振り返りの画像</SectionTitle>
                <Typography variant="body2" sx={{mb: 2}}>
                    {pastSessionId !== '' ? '上で選んだセッション' : '現在のセッション'}の振り返り（/salmon-review-overlay と同じ画面）を、X・Bluesky などに投稿できる PNG 画像でダウンロードします。
                </Typography>
                <SalmonReviewDownload sessionId={pastSessionId !== '' ? pastSessionId : currentSessionId}/>
            </Paper>
        </>
    );
};

export default SalmonPastSessionsCard;
