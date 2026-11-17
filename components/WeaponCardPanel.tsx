'use client';

import AddCircleOutlineRoundedIcon from '@mui/icons-material/AddCircleOutlineRounded';
import CasinoRoundedIcon from '@mui/icons-material/CasinoRounded';
import ImageRoundedIcon from '@mui/icons-material/ImageRounded';
import {
    Alert,
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    LinearProgress,
    Paper,
    Typography,
} from '@mui/material';
import axios from 'axios';
import React, {useCallback, useEffect, useRef, useState} from 'react';

import {StreamData} from '../app/api/stream-data/route';
import {WeaponCard} from '../lib/salmonWeapons';
import {downloadBlob, renderWeaponCardImage, weaponCardImageFileName} from '../lib/weaponCardImage';

import SectionTitle from './SectionTitle';
import WeaponPicker from './WeaponPicker';

const paperSx = {mb: 4, p: 4};

const formatDateTime = (timestamp: number) =>
    new Date(timestamp).toLocaleString('ja-JP', {month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false});

export interface WeaponCardState {
    card: WeaponCard | null;
    error: string;
    request: (send: () => Promise<{data: WeaponCard}>, message: string) => Promise<void>;
}

/** ブキ埋めカードの読み込み（pollMs を渡すと定期的に）と保存。素早く続けて押したときは、最後の操作の応答だけを使う */
export const useWeaponCard = (pollMs?: number): WeaponCardState => {
    const [card, setCard] = useState<WeaponCard | null>(null);
    const [error, setError] = useState('');
    // 素早く続けて押したとき、古い応答で新しい状態を戻さないための通し番号
    const latestRequest = useRef(0);
    // 定期的な読み込みは、操作の応答を古い状態で上書きしないよう、操作が無いあいだに始まって終わったときだけ使う
    const inFlight = useRef(0);

    const request = useCallback(async (send: () => Promise<{data: WeaponCard}>, message: string) => {
        const id = ++latestRequest.current;
        inFlight.current += 1;
        try {
            const res = await send();
            if (latestRequest.current === id) {
                setCard(res.data);
                setError('');
            }
        } catch {
            if (latestRequest.current === id) setError(message);
        } finally {
            inFlight.current -= 1;
        }
    }, []);

    useEffect(() => {
        const failure = 'ブキ埋めカードの読み込みに失敗しました。サーバーを確認してください。';
        // マウント時に API から読み込む（ほかのカードと同じパターン）
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void request(() => axios.get<WeaponCard>('/api/weapon-card'), failure);
        if (!pollMs) return;
        // 記録で埋まるのを見せるときは定期的に読み込み直す（操作の通し番号は進めない）
        const timer = setInterval(async () => {
            if (inFlight.current > 0) return;
            const startedAt = latestRequest.current;
            try {
                const res = await axios.get<WeaponCard>('/api/weapon-card');
                if (inFlight.current === 0 && latestRequest.current === startedAt) setCard(res.data);
            } catch {
                // 一時的な失敗は次の読み込みでやり直す（操作のエラー表示を消さない）
            }
        }, pollMs);
        return () => clearInterval(timer);
    }, [request, pollMs]);

    return {card, error, request};
};

const Progress: React.FC<{card: WeaponCard}> = ({card}) => (
    <Box sx={{display: 'flex', alignItems: 'center', gap: 2, mb: 2}}>
        <Typography variant="h5" sx={{fontVariantNumeric: 'tabular-nums'}} data-testid="weapon-card-count">
            {card.obtained.length} / {card.total}
        </Typography>
        <LinearProgress variant="determinate" value={(card.obtained.length / card.total) * 100} sx={{flex: 1, height: 8, borderRadius: 4}}/>
    </Box>
);

/** ブキを手動で埋める・外す（配信中の画面の「埋める・外す」で開く）。変更はその場で保存される */
export const WeaponCardManual: React.FC<WeaponCardState> = ({card, error, request}) => {
    if (!card) {
        return error ? <Alert severity="error">{error}</Alert> : <Typography>読み込み中...</Typography>;
    }

    const obtainedKeys = card.obtained.map((w) => w.key);
    const fromJob = new Set(card.obtained.filter((w) => w.source === 'job').map((w) => w.key));

    const handleToggle = (key: string) => void request(
        () => axios.patch<WeaponCard>('/api/weapon-card', {weapon: key, obtained: !obtainedKeys.includes(key)}),
        '保存に失敗しました。',
    );

    return (
        <>
            {error && <Alert severity="error" sx={{mb: 2}}>{error}</Alert>}
            <Progress card={card}/>
            <WeaponPicker
                label="ブキ埋めカード"
                selected={obtainedKeys}
                onSelect={handleToggle}
                isDisabled={(key) => fromJob.has(key)}
            />
            <Typography variant="caption" sx={{display: 'block', mt: 2, color: 'text.secondary'}}>
                サーモンランの記録で支給ブキを選ぶと自動で埋まります。押したブキは手動で埋める / 外すことができます（記録から埋まったブキは押せません。外すときは記録を取り消してください）。
            </Typography>
        </>
    );
};

/** 振り返りの画面のブキ埋めカード（進み具合・SNS 用の画像・新しいカード）。手動で埋める・外すのは配信中の画面 */
const WeaponCardPanel: React.FC = () => {
    const {card, error, request} = useWeaponCard();
    const [confirmingNewCard, setConfirmingNewCard] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [downloadError, setDownloadError] = useState('');

    if (!card) {
        return error ? <Alert severity="error">{error}</Alert> : <Typography>読み込み中...</Typography>;
    }

    const handleStartNewCard = () => {
        setConfirmingNewCard(false);
        void request(() => axios.post<WeaponCard>('/api/weapon-card', {}), '新しいカードを始められませんでした。');
    };

    const handleDownload = async () => {
        setDownloading(true);
        setDownloadError('');
        try {
            // オーバーレイと同じく、保存済みの共通設定のフォントで描く（取れなければ代わりのフォント）
            const fontFamily = await axios.get<StreamData>('/api/stream-data').then((res) => res.data.fontFamily, () => '');
            const now = new Date();
            downloadBlob(await renderWeaponCardImage(card, fontFamily, now), weaponCardImageFileName(now));
        } catch {
            setDownloadError('画像を作れませんでした。');
        } finally {
            setDownloading(false);
        }
    };

    return (
        <>
            {(error || downloadError) && <Alert severity="error" sx={{mb: 2}}>{downloadError || error}</Alert>}

            <Paper sx={paperSx}>
                <SectionTitle icon={CasinoRoundedIcon}>オールランダム ブキ埋め</SectionTitle>
                <Progress card={card}/>
                <Typography variant="body2" sx={{mb: 2}}>今のカードを SNS 用の PNG 画像でダウンロードします。</Typography>
                <Button variant="contained" onClick={handleDownload} disabled={downloading} startIcon={<ImageRoundedIcon/>}>
                    {downloading ? '画像を作成中...' : '画像をダウンロード'}
                </Button>
                <Typography variant="caption" sx={{display: 'block', mt: 2, color: 'text.secondary'}}>
                    ブキを手動で埋める・外すのは、配信中の画面の「ときどき直すもの」から。
                </Typography>
            </Paper>

            <Paper sx={paperSx}>
                <SectionTitle icon={AddCircleOutlineRoundedIcon}>新しいカード</SectionTitle>
                <Typography variant="body2" sx={{mb: 2}}>
                    {card.startedAt > 0 ? `今のカードは ${formatDateTime(card.startedAt)} から` : '今のカードはすべての記録から'}埋めています。
                </Typography>
                <Button variant="outlined" color="secondary" onClick={() => setConfirmingNewCard(true)}>新しいカードを始める</Button>
            </Paper>

            <Dialog open={confirmingNewCard} onClose={() => setConfirmingNewCard(false)}>
                <DialogTitle>新しいカードを始めますか？</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        埋まっているマスがすべて空になります。これまでのバイトの記録は消えません（新しいカードには数えません）。
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmingNewCard(false)}>やめる</Button>
                    <Button onClick={handleStartNewCard} color="secondary" variant="contained">始める</Button>
                </DialogActions>
            </Dialog>
        </>
    );
};

export default WeaponCardPanel;
