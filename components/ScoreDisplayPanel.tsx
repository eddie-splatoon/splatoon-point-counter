'use client';

import {Alert, Box, Button, FormControlLabel, Paper, Switch, TextField, Typography} from '@mui/material';
import axios from 'axios';
import React, {useCallback, useEffect, useState} from 'react';

import {MAX_SCORE_LABEL_LENGTH, MAX_SCORE_VALUE_LENGTH, ScoreDisplay, ScoreDisplaySettings} from '../lib/scoreDisplayTypes';

const paperSx = {p: 3, bgcolor: 'background.paper', backdropFilter: 'blur(10px)', border: '1px solid rgba(255, 255, 255, 0.1)'};

// リザルトの取り込みで書き換わった値を見せるため、定期的に読み込み直す
const POLL_INTERVAL_MS = 3000;

/**
 * コントロールパネルの「スコア表示」タブ。スコアは「OBSに反映」の保存とは別に、このタブの「反映」でその場で保存する
 * （リザルトの取り込みで自動で入れた値を、ほかのタブの保存で上書きしないため）
 */
const ScoreDisplayPanel: React.FC = () => {
    const [saved, setSaved] = useState<ScoreDisplaySettings | null>(null);
    // 編集中の値（null なら保存済みの値を表示する。編集中は読み込み直しで入力を上書きしない）
    const [draft, setDraft] = useState<ScoreDisplay | null>(null);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        try {
            setSaved((await axios.get<ScoreDisplaySettings>('/api/score-display')).data);
            setError('');
        } catch {
            setError('スコア表示を読み込めませんでした。サーバーを確認してください。');
        }
    }, []);

    useEffect(() => {
        // マウント時と定期的に API から読み込む（ClipPanel と同じパターン）
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void load();
        const timer = setInterval(() => void load(), POLL_INTERVAL_MS);
        return () => clearInterval(timer);
    }, [load]);

    const save = async (update: Partial<ScoreDisplaySettings>): Promise<boolean> => {
        try {
            setSaved((await axios.patch<ScoreDisplaySettings>('/api/score-display', update)).data);
            setError('');
            return true;
        } catch {
            setError('スコア表示を保存できませんでした。');
            return false;
        }
    };

    const handleApply = async () => {
        if (draft && await save(draft)) setDraft(null);
    };

    if (!saved) {
        return error ? <Alert severity="error">{error}</Alert> : <Typography>読み込み中...</Typography>;
    }

    const shown: ScoreDisplay = draft ?? {scoreLabel: saved.scoreLabel, scoreValue: saved.scoreValue};
    const edit = (delta: Partial<ScoreDisplay>) => setDraft({...shown, ...delta});

    return (
        <Paper elevation={12} sx={paperSx}>
            {error && <Alert severity="error" sx={{mb: 2}}>{error}</Alert>}
            <Typography variant="h6" gutterBottom>スコア設定</Typography>
            <FormControlLabel
                control={<Switch checked={saved.autoUpdate} onChange={(e) => void save({autoUpdate: e.target.checked})}/>}
                label="リザルトの取り込みで自動更新する"
            />
            <Typography variant="caption" sx={{display: 'block', color: 'text.secondary'}}>
                いつものバイトは「現在のバイト評価」、ビッグラン・バイトチームコンテストは今のシフトの「ハイスコア」（チームの金イクラ）を入れます。
            </Typography>
            <TextField
                label="フィールド名"
                value={shown.scoreLabel}
                onChange={(e) => edit({scoreLabel: e.target.value})}
                slotProps={{htmlInput: {maxLength: MAX_SCORE_LABEL_LENGTH}}}
                fullWidth
                margin="normal"
                variant="outlined"
                multiline
                rows={2}
            />
            <TextField
                label="値"
                value={shown.scoreValue}
                onChange={(e) => edit({scoreValue: e.target.value})}
                slotProps={{htmlInput: {maxLength: MAX_SCORE_VALUE_LENGTH}}}
                fullWidth
                margin="normal"
                variant="outlined"
            />
            <Box sx={{display: 'flex', gap: 1, mt: 1}}>
                <Button variant="contained" onClick={handleApply} disabled={draft === null} fullWidth>反映</Button>
                <Button variant="outlined" onClick={() => setDraft(null)} disabled={draft === null}>取り消し</Button>
            </Box>
            <Typography variant="caption" sx={{display: 'block', mt: 1, color: 'text.secondary'}}>
                スコアは「反映」でその場で保存されます（下の「OBSに反映」には含まれません）。
            </Typography>
        </Paper>
    );
};

export default ScoreDisplayPanel;
