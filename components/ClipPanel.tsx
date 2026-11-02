'use client';

import DeleteIcon from '@mui/icons-material/Delete';
import {Alert, Box, Button, Chip, IconButton, Link, List, ListItem, Paper, Typography} from '@mui/material';
import axios from 'axios';
import React, {useCallback, useEffect, useState} from 'react';

import {CLIP_SOURCE_LABELS, ClipRequest, clipUrl} from '../lib/clipTypes';

const paperSx = {mb: 3, p: 3, bgcolor: 'background.paper', backdropFilter: 'blur(10px)', border: '1px solid rgba(255, 255, 255, 0.1)'};

// 処理待ちの依頼が結果に変わるのを見せるため、定期的に読み込み直す
const POLL_INTERVAL_MS = 5000;

const formatDateTime = (timestamp: number) =>
    new Date(timestamp).toLocaleString('ja-JP', {month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false});

const STATUS_CHIPS = {
    pending: {label: '作成待ち', color: 'warning'},
    created: {label: '作成済み', color: 'success'},
    failed: {label: '失敗', color: 'error'},
} as const;

/** コントロールパネルの「クリップ」タブ。声やボタンで依頼した Twitch のクリップの履歴（作るのは tools/twitch-eventsub） */
const ClipPanel: React.FC = () => {
    const [clips, setClips] = useState<ClipRequest[] | null>(null);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        try {
            setClips((await axios.get<{clips: ClipRequest[]}>('/api/clip')).data.clips);
            setError('');
        } catch {
            setError('クリップの履歴を読み込めませんでした。サーバーを確認してください。');
        }
    }, []);

    useEffect(() => {
        // マウント時と定期的に API から読み込む（WeaponCardPanel と同じパターン）
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void load();
        const timer = setInterval(() => void load(), POLL_INTERVAL_MS);
        return () => clearInterval(timer);
    }, [load]);

    const handleRequest = async () => {
        try {
            await axios.post('/api/clip', {source: 'button'});
        } catch {
            setError('クリップを依頼できませんでした。');
            return;
        }
        await load();
    };

    const handleDelete = async (id: number) => {
        try {
            setClips((await axios.delete<{clips: ClipRequest[]}>(`/api/clip?id=${id}`)).data.clips);
            setError('');
        } catch {
            setError('履歴から削除できませんでした。');
        }
    };

    return (
        <>
            {error && <Alert severity="error" sx={{mb: 2}}>{error}</Alert>}

            <Paper elevation={12} sx={paperSx}>
                <Typography variant="h6" gutterBottom>🎬 Twitch のクリップ</Typography>
                <Typography variant="body2" sx={{mb: 2}}>
                    配信中に「クリップ撮って」「今のクリップ」などと言うと、直前の場面をクリップにします（文字起こし <code>pnpm caption</code> と Twitch 連携 <code>pnpm twitch</code> を起動しておく）。
                    作れたらテロップと読み上げで知らせます。
                </Typography>
                <Button variant="contained" onClick={handleRequest}>今クリップする</Button>
            </Paper>

            <Paper elevation={12} sx={paperSx}>
                <Typography variant="h6" gutterBottom>履歴</Typography>
                {clips === null ? (
                    !error && <Typography>読み込み中...</Typography>
                ) : clips.length === 0 ? (
                    <Typography variant="body2" sx={{color: 'text.secondary'}}>まだクリップはありません。</Typography>
                ) : (
                    <List dense aria-label="クリップの履歴">
                        {clips.map((clip) => (
                            <ListItem
                                key={clip.id}
                                divider
                                secondaryAction={
                                    <IconButton edge="end" size="small" onClick={() => handleDelete(clip.id)} aria-label={`${formatDateTime(clip.requestedAt)} のクリップを履歴から削除`}>
                                        <DeleteIcon fontSize="small"/>
                                    </IconButton>
                                }
                            >
                                <Box sx={{display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1}}>
                                    <Typography variant="body2" sx={{fontVariantNumeric: 'tabular-nums'}}>{formatDateTime(clip.requestedAt)}</Typography>
                                    <Chip size="small" variant="outlined" label={CLIP_SOURCE_LABELS[clip.source]}/>
                                    <Chip size="small" color={STATUS_CHIPS[clip.status].color} label={STATUS_CHIPS[clip.status].label}/>
                                    {clip.clipId && <Link href={clipUrl(clip.clipId)} target="_blank" rel="noopener noreferrer">クリップを見る</Link>}
                                    {clip.editUrl && <Link href={clip.editUrl} target="_blank" rel="noopener noreferrer">編集（タイトル・範囲）</Link>}
                                    {clip.error && <Typography variant="caption" sx={{color: 'error.main'}}>{clip.error}</Typography>}
                                </Box>
                            </ListItem>
                        ))}
                    </List>
                )}
                <Typography variant="caption" sx={{display: 'block', mt: 1, color: 'text.secondary'}}>
                    履歴から削除しても Twitch 上のクリップは消えません。
                </Typography>
            </Paper>
        </>
    );
};

export default ClipPanel;
