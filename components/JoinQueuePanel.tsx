'use client';

import DeleteIcon from '@mui/icons-material/Delete';
import {
    Alert,
    Box,
    Button,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    IconButton,
    List,
    ListItem,
    Paper,
    Typography,
} from '@mui/material';
import axios from 'axios';
import React, {useCallback, useEffect, useState} from 'react';

import {JOIN_HOW_TO, JoinQueuePanelView, JoinRating, formatJoinRating} from '../lib/joinQueueTypes';

const paperSx = {mb: 3, p: 3, bgcolor: 'background.paper', backdropFilter: 'blur(10px)', border: '1px solid rgba(255, 255, 255, 0.1)'};

// チャットからの参加を見せるため、定期的に読み込み直す
const POLL_INTERVAL_MS = 2000;

/** 評価と注記（手元だけに出す） */
function RatingText({rating, unreadable}: {rating: JoinRating | null; unreadable: boolean}) {
    return (
        <>
            <Typography component="span" variant="body2">{formatJoinRating(rating)}</Typography>
            {unreadable && <Typography component="span" variant="caption" sx={{color: 'warning.main'}}>読めなかったので書き方を返しました</Typography>}
            {rating?.note && <Typography component="span" variant="caption" sx={{color: 'text.secondary'}}>{rating.note}</Typography>}
        </>
    );
}

/** コントロールパネルの「参加」タブ。チャットの !参加 で並んだ人を「次の人」で呼ぶ（チャットを読むのは tools/twitch-eventsub） */
const JoinQueuePanel: React.FC = () => {
    const [queue, setQueue] = useState<JoinQueuePanelView | null>(null);
    const [error, setError] = useState('');
    const [confirmingClose, setConfirmingClose] = useState(false);

    const load = useCallback(async () => {
        try {
            setQueue((await axios.get<JoinQueuePanelView>('/api/join-queue?view=panel')).data);
            setError('');
        } catch {
            setError('受付の列を読み込めませんでした。サーバーを確認してください。');
        }
    }, []);

    useEffect(() => {
        // マウント時と定期的に API から読み込む（ClipPanel と同じパターン）
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void load();
        const timer = setInterval(() => void load(), POLL_INTERVAL_MS);
        return () => clearInterval(timer);
    }, [load]);

    const send = async (body: Record<string, unknown>, failure: string) => {
        try {
            setQueue((await axios.post<JoinQueuePanelView>('/api/join-queue', body)).data);
            setError('');
        } catch {
            setError(failure);
        }
    };

    const handleClose = async () => {
        setConfirmingClose(false);
        await send({action: 'close'}, '受付を終了できませんでした。');
    };

    return (
        <>
            {error && <Alert severity="error" sx={{mb: 2}}>{error}</Alert>}

            <Paper elevation={12} sx={paperSx}>
                <Typography variant="h6" gutterBottom>🙋 視聴者参加の受付</Typography>
                <Typography variant="body2" sx={{mb: 2}}>
                    受付中は、チャットの <code>{JOIN_HOW_TO}</code> で列に入り、<code>!取消</code> で抜けられます（Twitch 連携 <code>pnpm twitch</code> を起動しておく）。
                    受付の返信は全員に見えるので、評価はくり返しません。評価はこの画面だけに出ます。
                </Typography>
                {queue && (
                    <Box sx={{display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1}}>
                        <Chip color={queue.open ? 'success' : 'default'} label={queue.open ? '受付中' : '受付していません'}/>
                        {queue.open ? (
                            <>
                                <Button variant="contained" onClick={() => send({action: 'next'}, '次の人を呼べませんでした。')} disabled={queue.entries.length === 0}>
                                    次の人
                                </Button>
                                <Button variant="outlined" color="secondary" onClick={() => setConfirmingClose(true)}>受付終了</Button>
                            </>
                        ) : (
                            <Button variant="contained" onClick={() => send({action: 'open'}, '受付を始められませんでした。')}>受付開始</Button>
                        )}
                    </Box>
                )}
            </Paper>

            {queue && (
                <Paper elevation={12} sx={paperSx}>
                    <Typography variant="h6" gutterBottom>いまの人</Typography>
                    {queue.current ? (
                        <Box sx={{display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1}}>
                            <Typography sx={{fontWeight: 'bold'}}>{queue.current.userName}</Typography>
                            <RatingText rating={queue.current.rating} unreadable={queue.current.unreadable}/>
                        </Box>
                    ) : (
                        <Typography variant="body2" sx={{color: 'text.secondary'}}>まだ呼んでいません。</Typography>
                    )}

                    <Typography variant="h6" gutterBottom sx={{mt: 3}}>列（{queue.entries.length} 人）</Typography>
                    {queue.entries.length === 0 ? (
                        <Typography variant="body2" sx={{color: 'text.secondary'}}>まだ誰も並んでいません。</Typography>
                    ) : (
                        <List dense aria-label="受付の列">
                            {queue.entries.map((entry) => (
                                <ListItem
                                    key={entry.userId}
                                    divider
                                    secondaryAction={(
                                        <IconButton
                                            edge="end"
                                            size="small"
                                            onClick={() => send({action: 'remove', userId: entry.userId}, '列から外せませんでした。')}
                                            aria-label={`${entry.userName} を列から外す`}
                                        >
                                            <DeleteIcon fontSize="small"/>
                                        </IconButton>
                                    )}
                                >
                                    <Box sx={{display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1}}>
                                        <Typography variant="body2" sx={{fontVariantNumeric: 'tabular-nums'}}>{entry.position}.</Typography>
                                        <Typography variant="body2" sx={{fontWeight: 'bold'}}>{entry.userName}</Typography>
                                        <RatingText rating={entry.rating} unreadable={entry.unreadable}/>
                                    </Box>
                                </ListItem>
                            ))}
                        </List>
                    )}
                </Paper>
            )}

            <Dialog open={confirmingClose} onClose={() => setConfirmingClose(false)}>
                <DialogTitle>受付を終了しますか？</DialogTitle>
                <DialogContent>
                    <DialogContentText>列といまの人が消えます（チャットの !参加 も受け付けなくなります）。</DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmingClose(false)}>やめる</Button>
                    <Button onClick={handleClose} color="secondary" variant="contained">終了する</Button>
                </DialogActions>
            </Dialog>
        </>
    );
};

export default JoinQueuePanel;
