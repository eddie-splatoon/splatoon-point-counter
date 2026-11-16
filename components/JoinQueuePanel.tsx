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
    TextField,
    Typography,
} from '@mui/material';
import axios from 'axios';
import React, {useCallback, useEffect, useState} from 'react';

import {
    JOIN_ARGS_MAX_LENGTH,
    JOIN_HOW_TO,
    JoinAnnouncementKind,
    JoinQueuePanelView,
    JoinRating,
    formatHazardWithRating,
    formatJoinRating,
    isStaleRating,
    roundHazard,
} from '../lib/joinQueueTypes';

const paperSx = {mb: 3, p: 3, bgcolor: 'background.paper', backdropFilter: 'blur(10px)', border: '1px solid rgba(255, 255, 255, 0.1)'};

// チャットからの参加を見せるため、定期的に読み込み直す
const POLL_INTERVAL_MS = 2000;

const STALE_TEXT = 'シフトが替わる前の評価（古い）';

/** 評価と注記（手元だけに出す） */
function RatingText({rating, unreadable, stale = false}: {rating: JoinRating | null; unreadable: boolean; stale?: boolean}) {
    return (
        <>
            <Typography component="span" variant="body2">{formatJoinRating(rating)}</Typography>
            {stale && rating && <Typography component="span" variant="caption" sx={{color: 'warning.main'}}>{STALE_TEXT}</Typography>}
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
    const [streamerInput, setStreamerInput] = useState('');
    const [notice, setNotice] = useState('');

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

    const send = async (body: Record<string, unknown>, failure: string): Promise<boolean> => {
        try {
            setQueue((await axios.post<JoinQueuePanelView>('/api/join-queue', body)).data);
            setError('');
            return true;
        } catch {
            setError(failure);
            return false;
        }
    };

    const handleSetStreamer = async () => {
        if (await send({action: 'streamer', rating: streamerInput}, '配信者の評価を読めませんでした（例: でんせつ820）。')) setStreamerInput('');
    };

    const announce = async (kind: JoinAnnouncementKind) => {
        setNotice('');
        if (await send({action: 'announce', kind}, 'お知らせを流せませんでした。')) setNotice('チャットに書き込んで読み上げます（書き込めなければ読み上げだけ）。');
    };

    const stale = (ratedAt: number | null) => (queue ? isStaleRating(ratedAt, queue.shiftStart) : false);

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
                    <Typography variant="h6" gutterBottom>部屋の推定キケン度</Typography>
                    <Typography variant="body2" sx={{mb: 2, color: 'text.secondary'}}>
                        配信者と、いまの人・列の先頭から合わせて 4 人の評価の平均 ÷ 5（上限 333%。攻略 Wiki の解析値で、自己申告からの目安）。評価が不明の人は除きます。
                    </Typography>

                    <Box sx={{display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mb: 2}}>
                        <Typography variant="body2">配信者:</Typography>
                        {queue.streamer ? (
                            <>
                                <RatingText rating={queue.streamer.rating} unreadable={false} stale={stale(queue.streamer.ratedAt)}/>
                                <Chip size="small" label={queue.streamer.source === 'manual' ? '手入力' : '取り込んだ記録'}/>
                            </>
                        ) : (
                            <Typography variant="body2" sx={{color: 'text.secondary'}}>不明（取り込んだ記録に評価がありません）</Typography>
                        )}
                    </Box>
                    <Box sx={{display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mb: 2}}>
                        <TextField
                            size="small"
                            label="配信者の評価"
                            placeholder="でんせつ820"
                            value={streamerInput}
                            onChange={(e) => setStreamerInput(e.target.value)}
                            slotProps={{htmlInput: {maxLength: JOIN_ARGS_MAX_LENGTH}}}
                        />
                        <Button variant="outlined" onClick={handleSetStreamer} disabled={streamerInput.trim() === ''}>入れる</Button>
                        {queue.streamer?.source === 'manual' && (
                            <Button onClick={() => send({action: 'streamer', rating: null}, '取り込んだ記録に戻せませんでした。')}>取り込んだ記録に戻す</Button>
                        )}
                    </Box>

                    {queue.room.estimate === null ? (
                        <Typography variant="body2" sx={{color: 'text.secondary'}}>評価がわかる人がいないので出せません。</Typography>
                    ) : (
                        <>
                            <Typography variant="h5" component="p" sx={{fontWeight: 'bold'}}>
                                通常のバイトなら 約 {formatHazardWithRating(roundHazard(queue.room.estimate, 5))}
                            </Typography>
                            <Typography variant="body2" sx={{color: 'text.secondary'}}>
                                {[
                                    `${queue.room.counted} 人で計算`,
                                    queue.room.unknown > 0 ? `不明 ${queue.room.unknown} 人を除く` : null,
                                    queue.room.wild > 0 ? `野良 ${queue.room.wild} 人分は含まない` : null,
                                    queue.room.stale > 0 ? `古い評価 ${queue.room.stale} 人` : null,
                                ].filter((note) => note !== null).join('・')}
                            </Typography>
                            {queue.recommended && (
                                <Box component="ul" aria-label="おすすめのキケン度" sx={{mt: 1, mb: 0, pl: 3}}>
                                    <li>練習: {formatHazardWithRating(queue.recommended.practice)}</li>
                                    <li>通常: {formatHazardWithRating(queue.recommended.normal)}</li>
                                    <li>腕試し: {formatHazardWithRating(queue.recommended.challenge)}</li>
                                </Box>
                            )}
                        </>
                    )}
                    {queue.room.lowerTier > 0 && (
                        <Alert severity="warning" sx={{mt: 2}}>
                            配信者より低い称号の人が {queue.room.lowerTier} 人います。通常のバイトに合流すると、評価が上がるのはチームでいちばん低い称号の人だけです。
                        </Alert>
                    )}

                    <Box sx={{display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mt: 2}}>
                        <Button variant="outlined" onClick={() => announce('merge')}>合流のお知らせを流す</Button>
                        <Button variant="outlined" onClick={() => announce('private')}>プライベートのお知らせを流す</Button>
                    </Box>
                    {notice && <Alert severity="success" sx={{mt: 2}} onClose={() => setNotice('')}>{notice}</Alert>}
                </Paper>
            )}

            {queue && (
                <Paper elevation={12} sx={paperSx}>
                    <Typography variant="h6" gutterBottom>いまの人</Typography>
                    {queue.current ? (
                        <Box sx={{display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1}}>
                            <Typography sx={{fontWeight: 'bold'}}>{queue.current.userName}</Typography>
                            <RatingText rating={queue.current.rating} unreadable={queue.current.unreadable} stale={stale(queue.current.ratedAt)}/>
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
                                        <RatingText rating={entry.rating} unreadable={entry.unreadable} stale={stale(entry.ratedAt)}/>
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
