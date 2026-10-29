'use client';

import {Alert, Box, Button, Paper, Typography} from '@mui/material';
import axios from 'axios';
import React, {useCallback, useEffect, useState} from 'react';

import {TELOP_SHORTCUT_KEYS, TelopData, TelopPreset} from '../lib/telopTypes';

// 入力欄で数字を打っているときは、ショートカットとして扱わない
const isEditableTarget = (target: EventTarget | null) =>
    target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

interface TelopBarProps {
    /** 変わるたびにプリセットを読み込み直す（テロップタブでプリセットを編集したとき） */
    reloadKey?: number;
}

/**
 * コントロールパネルの上部に常に出すテロップのボタン。どのタブを開いていても、
 * ボタンかキーボードの 1〜9, 0 で並び順のプリセットを出せる
 */
const TelopBar: React.FC<TelopBarProps> = ({reloadKey = 0}) => {
    const [presets, setPresets] = useState<TelopPreset[] | null>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        let active = true;
        axios.get<TelopData>('/api/telop')
            .then((res) => {
                if (!active) return;
                setPresets(res.data.presets);
                setError('');
            })
            .catch(() => active && setError('テロップのプリセットを読み込めませんでした。'));
        return () => {
            active = false;
        };
    }, [reloadKey]);

    const show = useCallback(async (presetId: number) => {
        setError('');
        try {
            await axios.post('/api/telop', {presetId});
        } catch {
            setError('テロップを出せませんでした。');
        }
    }, []);

    useEffect(() => {
        if (!presets) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.isComposing || e.repeat || e.ctrlKey || e.metaKey || e.altKey || isEditableTarget(e.target)) return;
            const index = (TELOP_SHORTCUT_KEYS as readonly string[]).indexOf(e.key);
            const preset = index >= 0 ? presets[index] : undefined;
            if (!preset) return;
            e.preventDefault();
            void show(preset.id);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [presets, show]);

    return (
        // スクロールしても押せるよう上部に固定する（下のカードが透けないよう背景は不透明）
        <Paper elevation={12} sx={{position: 'sticky', top: 0, zIndex: 10, mb: 2, p: 1.5, bgcolor: '#2A2A2A', border: '1px solid rgba(255, 255, 255, 0.15)'}}>
            {error && <Alert severity="error" sx={{mb: 1}}>{error}</Alert>}
            {presets && presets.length > 0 ? (
                <Box data-testid="telop-buttons" sx={{display: 'flex', flexWrap: 'wrap', gap: 1}}>
                    {presets.map((preset, index) => (
                        <Button key={preset.id} variant="contained" size="small" onClick={() => void show(preset.id)} sx={{textTransform: 'none'}}>
                            {TELOP_SHORTCUT_KEYS[index] !== undefined && (
                                <Box component="kbd" sx={{mr: 1, px: 0.75, borderRadius: 1, bgcolor: 'rgba(0,0,0,0.3)', fontFamily: 'monospace'}}>
                                    {TELOP_SHORTCUT_KEYS[index]}
                                </Box>
                            )}
                            {preset.text}
                        </Button>
                    ))}
                </Box>
            ) : (
                presets && <Typography variant="body2" sx={{color: 'text.secondary'}}>テロップのプリセットがありません（「テロップ」タブで追加できます）</Typography>
            )}
        </Paper>
    );
};

export default TelopBar;
