'use client';

import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ExpandLessRoundedIcon from '@mui/icons-material/ExpandLessRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import GroupAddRoundedIcon from '@mui/icons-material/GroupAddRounded';
import QueryStatsRoundedIcon from '@mui/icons-material/QueryStatsRounded';
import StarRateRoundedIcon from '@mui/icons-material/StarRateRounded';
import {
    Alert,
    Box,
    Button,
    ButtonBase,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    IconButton,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    TextField,
    Typography,
} from '@mui/material';
import axios from 'axios';
import React, {useCallback, useEffect, useState} from 'react';

import {tokens} from '../app/control-panel/theme';
import {
    JOIN_ARGS_MAX_LENGTH,
    JOIN_HOW_TO,
    JOIN_STATS_DAYS,
    JoinAnnouncementKind,
    JoinQueuePanelView,
    JoinRating,
    formatHazardWithRating,
    formatJoinRating,
    isStaleRating,
    roundHazard,
} from '../lib/joinQueueTypes';

import LiveCard from './LiveCard';
import SectionTitle from './SectionTitle';

// チャットからの参加を見せるため、定期的に読み込み直す
const POLL_INTERVAL_MS = 2000;

const STALE_TEXT = 'シフトが替わる前の評価（古い）';

const formatTime = (at: number) => new Date(at).toLocaleTimeString('ja-JP', {hour: '2-digit', minute: '2-digit'});
const formatDateTime = (at: number) => new Date(at).toLocaleString('ja-JP', {month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'});

interface JoinQueueState {
    queue: JoinQueuePanelView | null;
    error: string;
    /** 操作を送って、応答の状態に置き換える。失敗したら failure を出す */
    send: (body: Record<string, unknown>, failure: string) => Promise<boolean>;
}

/** 視聴者参加の受付の手元用の状態（評価つき。/api/join-queue?view=panel）。pollMs を渡すと定期的に読み込み直す */
const useJoinQueue = (pollMs?: number): JoinQueueState => {
    const [queue, setQueue] = useState<JoinQueuePanelView | null>(null);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        try {
            setQueue((await axios.get<JoinQueuePanelView>('/api/join-queue?view=panel')).data);
            setError('');
        } catch {
            setError('受付の列を読み込めませんでした。サーバーを確認してください。');
        }
    }, []);

    useEffect(() => {
        // マウント時と（pollMs があれば）定期的に API から読み込む
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void load();
        if (!pollMs) return;
        const timer = setInterval(() => void load(), pollMs);
        return () => clearInterval(timer);
    }, [load, pollMs]);

    const send = useCallback(async (body: Record<string, unknown>, failure: string): Promise<boolean> => {
        try {
            setQueue((await axios.post<JoinQueuePanelView>('/api/join-queue', body)).data);
            setError('');
            return true;
        } catch {
            setError(failure);
            return false;
        }
    }, []);

    return {queue, error, send};
};

/** 評価と注記（手元だけに出す） */
function RatingText({rating, unreadable, stale = false}: {rating: JoinRating | null; unreadable: boolean; stale?: boolean}) {
    return (
        <>
            <Typography component="span" variant="body2" sx={{color: 'text.secondary'}}>{formatJoinRating(rating)}</Typography>
            {stale && rating && <Typography component="span" variant="caption" sx={{color: 'warning.main'}}>{STALE_TEXT}</Typography>}
            {unreadable && <Typography component="span" variant="caption" sx={{color: 'warning.main'}}>読めなかったので書き方を返しました</Typography>}
            {rating?.note && <Typography component="span" variant="caption" sx={{color: 'text.secondary'}}>{rating.note}</Typography>}
        </>
    );
}

const bigButtonSx = {height: tokens.height.live, borderRadius: `${tokens.radius.primary}px`, fontSize: 16} as const;

/** 部屋の推定キケン度。1 行の要約で、押すと内訳（計算に入れた人数・おすすめ・低い称号の注意）を開く */
const RoomHazard: React.FC<{queue: JoinQueuePanelView}> = ({queue}) => {
    const [open, setOpen] = useState(false);
    const {room, recommended} = queue;
    return (
        <Box sx={{mt: 2.5, borderRadius: `${tokens.radius.control}px`, border: '1px solid', borderColor: 'divider'}}>
            <ButtonBase
                onClick={() => setOpen(!open)}
                aria-expanded={open}
                sx={{display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left', px: 3, py: 2.5, borderRadius: `${tokens.radius.control}px`}}
            >
                <Box>
                    <Typography sx={{fontSize: 12, color: 'text.secondary'}}>部屋の推定キケン度</Typography>
                    <Typography sx={{fontSize: 16, fontWeight: 700}}>
                        {room.estimate === null ? '評価がわかる人がいないので出せません。' : `約 ${formatHazardWithRating(roundHazard(room.estimate, 5))}`}
                    </Typography>
                </Box>
                {open ? <ExpandLessRoundedIcon sx={{color: 'text.secondary'}}/> : <ExpandMoreRoundedIcon sx={{color: 'text.secondary'}}/>}
            </ButtonBase>
            {room.lowerTier > 0 && (
                <Alert severity="warning" sx={{mx: 2, mb: 2}}>
                    配信者より低い称号の人が {room.lowerTier} 人います。通常のバイトに合流すると、評価が上がるのはチームでいちばん低い称号の人だけです。
                </Alert>
            )}
            {open && (
                <Box sx={{px: 3, pb: 2.5}}>
                    {room.estimate !== null && (
                        <Typography variant="body2" sx={{color: 'text.secondary'}}>
                            {[
                                `${room.counted} 人で計算`,
                                room.unknown > 0 ? `不明 ${room.unknown} 人を除く` : null,
                                room.wild > 0 ? `野良 ${room.wild} 人分は含まない` : null,
                                room.stale > 0 ? `古い評価 ${room.stale} 人` : null,
                            ].filter((note) => note !== null).join('・')}
                        </Typography>
                    )}
                    {recommended && (
                        <Box component="ul" aria-label="おすすめのキケン度" sx={{mt: 1, mb: 0, pl: 5}}>
                            <li>練習: {formatHazardWithRating(recommended.practice)}</li>
                            <li>通常: {formatHazardWithRating(recommended.normal)}</li>
                            <li>腕試し: {formatHazardWithRating(recommended.challenge)}</li>
                        </Box>
                    )}
                    <Typography variant="caption" sx={{display: 'block', mt: 1, color: 'text.secondary'}}>
                        配信者と、いまの人・列の先頭から合わせて 4 人の評価の平均 ÷ 5（上限 333%。攻略 Wiki の解析値で、自己申告からの目安）。評価が不明の人は除きます。
                        配信者の評価は準備の画面で入れられます。
                    </Typography>
                </Box>
            )}
        </Box>
    );
};

/**
 * 配信中の画面の視聴者参加のカード。チャットの !参加 で並んだ人を「次の人を呼ぶ」で呼ぶ（チャットを読むのは tools/twitch-eventsub）。
 * 評価はこの画面だけに出す（配信画面には出さない）。配信者の評価の入力は準備、これまでの受付は振り返りの画面
 */
const JoinQueuePanel: React.FC = () => {
    const {queue, error, send} = useJoinQueue(POLL_INTERVAL_MS);
    const [confirmingClose, setConfirmingClose] = useState(false);
    const [notice, setNotice] = useState('');

    const announce = async (kind: JoinAnnouncementKind) => {
        setNotice('');
        if (await send({action: 'announce', kind}, 'お知らせを流せませんでした。')) setNotice('チャットに書き込んで読み上げます（書き込めなければ読み上げだけ）。');
    };

    const stale = (ratedAt: number | null) => (queue ? isStaleRating(ratedAt, queue.shiftStart) : false);

    const handleClose = async () => {
        setConfirmingClose(false);
        await send({action: 'close'}, '受付を終了できませんでした。');
    };

    const open = queue?.open ?? false;

    return (
        <LiveCard
            icon={GroupAddRoundedIcon}
            title="視聴者参加"
            sx={{borderColor: open ? 'success.main' : 'divider'}}
            aside={queue && (open ? (
                <Chip
                    size="small"
                    label={`受付中 · 列 ${queue.entries.length} 人`}
                    icon={<Box component="span" sx={{width: 8, height: 8, borderRadius: '50%', bgcolor: 'success.main', ml: '8px !important'}}/>}
                    sx={{bgcolor: tokens.color.successSoft, color: '#7FE3B0'}}
                />
            ) : (
                <Chip size="small" label="受付していません" sx={{bgcolor: 'background.default', color: 'text.secondary'}}/>
            ))}
        >
            {error && <Alert severity="error" sx={{mb: 2}}>{error}</Alert>}
            {queue?.reconnectedAt && (
                <Alert
                    severity="warning"
                    sx={{mb: 2}}
                    action={<Button color="inherit" size="small" onClick={() => send({action: 'dismissReconnect'}, '表示を消せませんでした。')}>確認した</Button>}
                >
                    {formatTime(queue.reconnectedAt)} に Twitch に再接続しました（その間の参加は受け付けられていない可能性あり）。チャットを見て、並びたい人がいないか確かめてください。
                </Alert>
            )}

            {queue && !open && (
                <>
                    <Button variant="contained" fullWidth onClick={() => send({action: 'open'}, '受付を始められませんでした。')} sx={bigButtonSx}>
                        受付を始める
                    </Button>
                    <Typography variant="caption" sx={{display: 'block', mt: 2, color: 'text.secondary'}}>
                        チャットの <code>{JOIN_HOW_TO}</code> で列に入り、<code>!取消</code> で抜けます（Twitch 連携 <code>pnpm twitch</code> を起動しておく）。評価はこの画面だけに出ます。
                    </Typography>
                </>
            )}

            {queue && open && (
                <>
                    <Box sx={{bgcolor: 'background.default', borderRadius: `${tokens.radius.control}px`, px: 3, py: 2.5, mb: 2.5}}>
                        <Typography sx={{fontSize: 12, color: 'text.secondary'}}>いまの人</Typography>
                        {queue.current ? (
                            <Box data-testid="join-current" sx={{display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 2}}>
                                <Typography component="strong" sx={{fontSize: 18, fontWeight: 700}}>{queue.current.userName}</Typography>
                                <RatingText rating={queue.current.rating} unreadable={queue.current.unreadable} stale={stale(queue.current.ratedAt)}/>
                            </Box>
                        ) : (
                            <Typography variant="body2" sx={{color: 'text.secondary'}}>まだ呼んでいません。</Typography>
                        )}
                    </Box>
                    <Button
                        variant="contained"
                        fullWidth
                        onClick={() => send({action: 'next'}, '次の人を呼べませんでした。')}
                        disabled={queue.entries.length === 0}
                        sx={bigButtonSx}
                    >
                        次の人を呼ぶ
                    </Button>

                    {queue.entries.length === 0 ? (
                        <Typography variant="body2" sx={{mt: 2.5, color: 'text.secondary'}}>まだ誰も並んでいません。</Typography>
                    ) : (
                        // 列が長くても、カードが画面からはみ出さないようにする
                        <Box component="ol" aria-label="受付の列" sx={{listStyle: 'none', m: 0, mt: 2.5, p: 0, maxHeight: 220, overflowY: 'auto'}}>
                            {queue.entries.map((entry) => (
                                <Box component="li" key={entry.userId} sx={{display: 'flex', alignItems: 'center', gap: 2, py: 1, borderTop: '1px solid #232832'}}>
                                    <Typography variant="body2" sx={{width: 20, flex: 'none', color: 'text.secondary', fontVariantNumeric: 'tabular-nums'}}>{entry.position}</Typography>
                                    <Box sx={{flex: '1 1 auto', minWidth: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 2}}>
                                        <Typography variant="body2" sx={{fontWeight: 600}}>{entry.userName}</Typography>
                                        <RatingText rating={entry.rating} unreadable={entry.unreadable} stale={stale(entry.ratedAt)}/>
                                    </Box>
                                    <IconButton
                                        size="small"
                                        onClick={() => send({action: 'remove', userId: entry.userId}, '列から外せませんでした。')}
                                        aria-label={`${entry.userName} を列から外す`}
                                    >
                                        <CloseRoundedIcon fontSize="small"/>
                                    </IconButton>
                                </Box>
                            ))}
                        </Box>
                    )}

                    <RoomHazard queue={queue}/>

                    <Box sx={{display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 2.5}}>
                        <Button variant="outlined" size="small" onClick={() => announce('merge')} sx={{borderColor: '#5B3346', color: '#FF9CC0'}}>合流のお知らせ</Button>
                        <Button variant="outlined" size="small" onClick={() => announce('private')} sx={{borderColor: '#5B3346', color: '#FF9CC0'}}>プラベのお知らせ</Button>
                        <Button size="small" color="error" onClick={() => setConfirmingClose(true)} sx={{ml: 'auto'}}>受付を終わる</Button>
                    </Box>
                    {notice && <Alert severity="success" sx={{mt: 2}} onClose={() => setNotice('')}>{notice}</Alert>}
                </>
            )}

            <Dialog open={confirmingClose} onClose={() => setConfirmingClose(false)}>
                <DialogTitle>受付を終了しますか？</DialogTitle>
                <DialogContent>
                    <DialogContentText>列といまの人が消えます（チャットの !参加 も受け付けなくなります）。人数だけを「これまでの受付」に残します。</DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmingClose(false)}>やめる</Button>
                    <Button onClick={handleClose} color="error" variant="contained">終了する</Button>
                </DialogActions>
            </Dialog>
        </LiveCard>
    );
};

/** 準備の画面の、配信者の評価（部屋の推定キケン度に使う）。入れなければ取り込んだ記録の評価を使う */
export const JoinStreamerRatingCard: React.FC = () => {
    const {queue, error, send} = useJoinQueue();
    const [input, setInput] = useState('');

    const handleSet = async () => {
        if (await send({action: 'streamer', rating: input}, '配信者の評価を読めませんでした（例: でんせつ820）。')) setInput('');
    };

    return (
        <Paper sx={{mb: 4, p: 4}}>
            <SectionTitle icon={StarRateRoundedIcon}>配信者の評価（視聴者参加）</SectionTitle>
            {error && <Alert severity="error" sx={{mb: 2}}>{error}</Alert>}
            {queue && (
                <Box sx={{display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, mb: 3}}>
                    <Typography variant="body2">いまの評価:</Typography>
                    {queue.streamer ? (
                        <>
                            <RatingText rating={queue.streamer.rating} unreadable={false} stale={isStaleRating(queue.streamer.ratedAt, queue.shiftStart)}/>
                            <Chip size="small" label={queue.streamer.source === 'manual' ? '手入力' : '取り込んだ記録'}/>
                        </>
                    ) : (
                        <Typography variant="body2" sx={{color: 'text.secondary'}}>不明（取り込んだ記録に評価がありません）</Typography>
                    )}
                </Box>
            )}
            <Box sx={{display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2}}>
                <TextField
                    size="small"
                    label="配信者の評価"
                    placeholder="でんせつ820"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    slotProps={{htmlInput: {maxLength: JOIN_ARGS_MAX_LENGTH}}}
                />
                <Button variant="outlined" onClick={handleSet} disabled={input.trim() === ''}>入れる</Button>
                {queue?.streamer?.source === 'manual' && (
                    <Button onClick={() => send({action: 'streamer', rating: null}, '取り込んだ記録に戻せませんでした。')}>取り込んだ記録に戻す</Button>
                )}
            </Box>
            <Typography variant="caption" sx={{display: 'block', mt: 2, color: 'text.secondary'}}>
                入れた評価は、それより後のバイトを取り込むまで使います（サーバーを再起動すると消えます）。
            </Typography>
        </Paper>
    );
};

/** 振り返りの画面の、これまでの受付（枠ごとの人数だけ。誰が来たかは残さない） */
export const JoinHistoryCard: React.FC = () => {
    const {queue, error} = useJoinQueue();
    return (
        <Paper sx={{mb: 4, p: 4}}>
            <SectionTitle icon={QueryStatsRoundedIcon}>これまでの受付（{JOIN_STATS_DAYS} 日）</SectionTitle>
            {error && <Alert severity="error" sx={{mb: 2}}>{error}</Alert>}
            <Typography variant="body2" sx={{mb: 1, color: 'text.secondary'}}>
                受付終了（配信の終了でも）のたびに人数だけを残します（誰が来たかは残しません）。
            </Typography>
            {queue && (queue.history.length === 0 ? (
                <Typography variant="body2" sx={{color: 'text.secondary'}}>まだありません。</Typography>
            ) : (
                <Table size="small" aria-label="これまでの受付">
                    <TableHead>
                        <TableRow>
                            <TableCell>受付開始</TableCell>
                            <TableCell align="right">並んだ人</TableCell>
                            <TableCell align="right">呼んだ人</TableCell>
                            <TableCell align="right">2 回以上</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {queue.history.map((w) => (
                            <TableRow key={`${w.openedAt}-${w.closedAt}`}>
                                <TableCell>{formatDateTime(w.openedAt)}〜{formatTime(w.closedAt)}</TableCell>
                                <TableCell align="right">{w.joined}</TableCell>
                                <TableCell align="right">{w.called}</TableCell>
                                <TableCell align="right">{w.repeated}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            ))}
        </Paper>
    );
};

export default JoinQueuePanel;
