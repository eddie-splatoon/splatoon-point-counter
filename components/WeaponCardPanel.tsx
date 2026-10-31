'use client';

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

import {WeaponCard} from '../lib/salmonWeapons';

import WeaponPicker from './WeaponPicker';

const paperSx = {mb: 3, p: 3, bgcolor: 'background.paper', backdropFilter: 'blur(10px)', border: '1px solid rgba(255, 255, 255, 0.1)'};

const formatDateTime = (timestamp: number) =>
    new Date(timestamp).toLocaleString('ja-JP', {month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false});

/** コントロールパネルの「ブキ埋め」タブ。変更はその場で保存される（「OBSに反映」は不要） */
const WeaponCardPanel: React.FC = () => {
    const [card, setCard] = useState<WeaponCard | null>(null);
    const [error, setError] = useState('');
    const [confirmingNewCard, setConfirmingNewCard] = useState(false);
    // 素早く続けて押したとき、古い応答で新しい状態を戻さないための通し番号
    const latestRequest = useRef(0);

    const request = useCallback(async (send: () => Promise<{data: WeaponCard}>, message: string) => {
        const id = ++latestRequest.current;
        try {
            const res = await send();
            if (latestRequest.current === id) {
                setCard(res.data);
                setError('');
            }
        } catch {
            if (latestRequest.current === id) setError(message);
        }
    }, []);

    useEffect(() => {
        // マウント時に API から読み込む（SidePanelSettingsPanel と同じパターン）
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void request(() => axios.get<WeaponCard>('/api/weapon-card'), 'ブキ埋めカードの読み込みに失敗しました。サーバーを確認してください。');
    }, [request]);

    if (!card) {
        return error ? <Alert severity="error">{error}</Alert> : <Typography>読み込み中...</Typography>;
    }

    const obtainedKeys = card.obtained.map((w) => w.key);
    const fromJob = new Set(card.obtained.filter((w) => w.source === 'job').map((w) => w.key));

    const handleToggle = (key: string) => void request(
        () => axios.patch<WeaponCard>('/api/weapon-card', {weapon: key, obtained: !obtainedKeys.includes(key)}),
        '保存に失敗しました。',
    );

    const handleStartNewCard = () => {
        setConfirmingNewCard(false);
        void request(() => axios.post<WeaponCard>('/api/weapon-card', {}), '新しいカードを始められませんでした。');
    };

    return (
        <>
            {error && <Alert severity="error" sx={{mb: 2}}>{error}</Alert>}

            <Paper elevation={12} sx={paperSx}>
                <Typography variant="h6" gutterBottom>🎲 オールランダム ブキ埋め</Typography>
                <Box sx={{display: 'flex', alignItems: 'center', gap: 2, mb: 2}}>
                    <Typography variant="h5" sx={{fontVariantNumeric: 'tabular-nums'}} data-testid="weapon-card-count">
                        {obtainedKeys.length} / {card.total}
                    </Typography>
                    <LinearProgress variant="determinate" value={(obtainedKeys.length / card.total) * 100} sx={{flex: 1, height: 8, borderRadius: 4}}/>
                </Box>
                <WeaponPicker
                    label="ブキ埋めカード"
                    selected={obtainedKeys}
                    onSelect={handleToggle}
                    isDisabled={(key) => fromJob.has(key)}
                />
                <Typography variant="caption" sx={{display: 'block', mt: 2, color: 'text.secondary'}}>
                    サーモンランタブで支給ブキを選んで記録すると自動で埋まります。押したブキは手動で埋める / 外すことができます（記録から埋まったブキは押せません。外すときは記録を取り消してください）。
                </Typography>
            </Paper>

            <Paper elevation={12} sx={paperSx}>
                <Typography variant="h6" gutterBottom>🆕 新しいカード</Typography>
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
