'use client';

import ScoreboardRoundedIcon from '@mui/icons-material/ScoreboardRounded';
import {Alert, Box, Button, FormControlLabel, Paper, Switch, TextField, Typography} from '@mui/material';
import axios from 'axios';
import React, {useCallback, useEffect, useState} from 'react';

import {MAX_SCORE_LABEL_LENGTH, MAX_SCORE_VALUE_LENGTH, ScoreDisplay, ScoreDisplaySettings} from '../lib/scoreDisplayTypes';

import SectionTitle from './SectionTitle';

// リザルトの取り込みで書き換わった値を見せるため、定期的に読み込み直す
const POLL_INTERVAL_MS = 3000;

export interface ScoreDisplayState {
    saved: ScoreDisplaySettings | null;
    error: string;
    /** 送った項目だけを保存する（PATCH /api/score-display） */
    save: (update: Partial<ScoreDisplaySettings>) => Promise<boolean>;
}

/** スコア表示（/obs-overlay のラベル・値と自動更新）の読み込み（定期的）と保存 */
export const useScoreDisplay = (): ScoreDisplayState => {
    const [saved, setSaved] = useState<ScoreDisplaySettings | null>(null);
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
        // マウント時と定期的に API から読み込む
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void load();
        const timer = setInterval(() => void load(), POLL_INTERVAL_MS);
        return () => clearInterval(timer);
    }, [load]);

    const save = useCallback(async (update: Partial<ScoreDisplaySettings>): Promise<boolean> => {
        try {
            setSaved((await axios.patch<ScoreDisplaySettings>('/api/score-display', update)).data);
            setError('');
            return true;
        } catch {
            setError('スコア表示を保存できませんでした。');
            return false;
        }
    }, []);

    return {saved, error, save};
};

/**
 * スコア表示のラベル・値を直す（配信中の画面の「直す」で開く）。スコアはリザルトの取り込みでも書き換わるので、ほかの設定と違って入力のたびには保存せず、
 * 「反映」で編集した項目だけを保存する（取り込みで自動で入れた値を書き戻さないため）
 */
export const ScoreDisplayEditor: React.FC<ScoreDisplayState & {onApplied?: () => void}> = ({saved, error, save, onApplied}) => {
    // 編集した項目だけ（null なら保存済みの値を表示する）。編集中は読み込み直しで入力を上書きしない
    const [draft, setDraft] = useState<Partial<ScoreDisplay> | null>(null);

    const handleApply = async () => {
        if (draft && await save(draft)) {
            setDraft(null);
            onApplied?.();
        }
    };

    if (!saved) {
        return error ? <Alert severity="error">{error}</Alert> : <Typography>読み込み中...</Typography>;
    }

    const shown: ScoreDisplay = {scoreLabel: saved.scoreLabel, scoreValue: saved.scoreValue, ...draft};
    const edit = (delta: Partial<ScoreDisplay>) => setDraft({...draft, ...delta});

    return (
        <>
            {error && <Alert severity="error" sx={{mb: 2}}>{error}</Alert>}
            <TextField
                label="フィールド名"
                value={shown.scoreLabel}
                onChange={(e) => edit({scoreLabel: e.target.value})}
                slotProps={{htmlInput: {maxLength: MAX_SCORE_LABEL_LENGTH}}}
                fullWidth
                margin="normal"
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
            />
            <Box sx={{display: 'flex', gap: 1, mt: 1}}>
                <Button variant="contained" onClick={handleApply} disabled={draft === null} fullWidth>反映</Button>
                <Button variant="outlined" onClick={() => setDraft(null)} disabled={draft === null}>取り消し</Button>
            </Box>
            <Typography variant="caption" sx={{display: 'block', mt: 1, color: 'text.secondary'}}>
                スコアは「反映」を押したときに保存されます（入力の途中では保存しません）。
                {saved.autoUpdate && ' リザルトの取り込みで自動更新しているので、次の取り込みで書き換わります（設定の「見た目」で止められます）。'}
            </Typography>
        </>
    );
};

/** 設定の、スコア表示の自動更新の ON/OFF */
export const ScoreAutoUpdateCard: React.FC = () => {
    const {saved, error, save} = useScoreDisplay();
    return (
        <Paper sx={{mb: 4, p: 4}}>
            <SectionTitle icon={ScoreboardRoundedIcon}>スコア表示</SectionTitle>
            {error && <Alert severity="error" sx={{mb: 2}}>{error}</Alert>}
            {saved && (
                <FormControlLabel
                    control={<Switch checked={saved.autoUpdate} onChange={(e) => void save({autoUpdate: e.target.checked})}/>}
                    label="リザルトの取り込みで自動更新する"
                />
            )}
            <Typography variant="caption" sx={{display: 'block', color: 'text.secondary'}}>
                いつものバイトは「現在のバイト評価」、ビッグラン・バイトチームコンテストは今のシフトの「ハイスコア」（チームの金イクラ）を入れます。
                ラベル・値は配信中の画面の「直す」で変えられます。
            </Typography>
        </Paper>
    );
};
