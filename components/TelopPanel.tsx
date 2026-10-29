'use client';

import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import RemoveCircleIcon from '@mui/icons-material/RemoveCircle';
import {
    Alert,
    Box,
    Button,
    Checkbox,
    FormControlLabel,
    IconButton,
    Paper,
    TextField,
    Typography,
} from '@mui/material';
import axios from 'axios';
import React, {useCallback, useEffect, useRef, useState} from 'react';

import {
    MAX_TELOP_LENGTH,
    MAX_TELOP_PRESETS,
    TELOP_SHORTCUT_KEYS,
    TelopData,
    TelopPreset,
    normalizeTelopText,
} from '../lib/telopTypes';

const paperSx = {mb: 3, p: 3, bgcolor: 'background.paper', backdropFilter: 'blur(10px)', border: '1px solid rgba(255, 255, 255, 0.1)'};

// 入力欄で数字を打っているときは、ショートカットとして扱わない
const isEditableTarget = (target: EventTarget | null) =>
    target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

/** コントロールパネルの「テロップ」タブ。ボタンかキーボードの 1〜9, 0 でテロップを出す。プリセットの変更はその場で保存される */
const TelopPanel: React.FC = () => {
    const [presets, setPresets] = useState<TelopPreset[] | null>(null);
    const [freeText, setFreeText] = useState('');
    const [newPreset, setNewPreset] = useState('');
    const [error, setError] = useState('');
    // プリセットの保存は1件ずつ順に送る（並行して送ると、後の変更より先の変更が後に届いて残ることがある）
    const saveQueue = useRef<Promise<void>>(Promise.resolve());

    const load = useCallback(async () => {
        try {
            const res = await axios.get<TelopData>('/api/telop');
            setPresets(res.data.presets);
        } catch {
            setError('テロップの設定の読み込みに失敗しました。サーバーを確認してください。');
        }
    }, []);

    useEffect(() => {
        // マウント時に API から設定を読み込む（SidePanelSettingsPanel と同じパターン）
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void load();
    }, [load]);

    /** テロップを出す。出せたかを返す */
    const show = useCallback(async (body: {presetId: number} | {text: string}): Promise<boolean> => {
        setError('');
        try {
            await axios.post('/api/telop', body);
            return true;
        } catch {
            setError('テロップを出せませんでした。');
            return false;
        }
    }, []);

    // コントロールパネルにフォーカスがあるとき、1〜9, 0 で並び順のプリセットを出す
    useEffect(() => {
        if (!presets) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.isComposing || e.repeat || e.ctrlKey || e.metaKey || e.altKey || isEditableTarget(e.target)) return;
            const index = (TELOP_SHORTCUT_KEYS as readonly string[]).indexOf(e.key);
            const preset = index >= 0 ? presets[index] : undefined;
            if (!preset) return;
            e.preventDefault();
            void show({presetId: preset.id});
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [presets, show]);

    const savePresets = (next: TelopPreset[]) => {
        setPresets(next);
        setError('');
        // 表示は送信前に更新しておく。応答で上書きすると、素早い連続操作で古い応答が新しい状態を戻してしまう
        const save = saveQueue.current.then(async () => {
            try {
                await axios.put('/api/telop', {presets: next});
            } catch {
                setError('プリセットの保存に失敗しました。');
                await load();
            }
        });
        saveQueue.current = save;
        return save;
    };

    if (!presets) {
        return error ? <Alert severity="error">{error}</Alert> : <Typography>読み込み中...</Typography>;
    }

    const normalizedFreeText = normalizeTelopText(freeText);
    const handleShowFreeText = async () => {
        if (normalizedFreeText === null) return;
        // 出せなかったときは入力を残して、そのまま再送できるようにする
        if (await show({text: normalizedFreeText})) setFreeText('');
    };

    const normalizedNewPreset = normalizeTelopText(newPreset);
    const canAddPreset = normalizedNewPreset !== null && presets.length < MAX_TELOP_PRESETS;
    const handleAddPreset = () => {
        if (!canAddPreset) return;
        const id = Math.max(0, ...presets.map((p) => p.id)) + 1;
        void savePresets([...presets, {id, text: normalizedNewPreset, speak: false}]);
        setNewPreset('');
    };

    const movePreset = (index: number, offset: -1 | 1) => {
        const next = [...presets];
        [next[index], next[index + offset]] = [next[index + offset], next[index]];
        void savePresets(next);
    };

    return (
        <>
            {error && <Alert severity="error" sx={{mb: 2}}>{error}</Alert>}

            <Paper elevation={12} sx={paperSx}>
                <Typography variant="h6" gutterBottom>📣 テロップを出す</Typography>
                {presets.length === 0 ? (
                    <Typography variant="body2" sx={{color: 'text.secondary', p: 1}}>プリセットがありません</Typography>
                ) : (
                    <Box data-testid="telop-buttons" sx={{display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1}}>
                        {presets.map((preset, index) => (
                            <Button
                                key={preset.id}
                                variant="contained"
                                onClick={() => void show({presetId: preset.id})}
                                sx={{justifyContent: 'flex-start', textTransform: 'none'}}
                            >
                                {TELOP_SHORTCUT_KEYS[index] !== undefined && (
                                    <Box component="kbd" sx={{mr: 1, px: 0.75, borderRadius: 1, bgcolor: 'rgba(0,0,0,0.3)', fontFamily: 'monospace'}}>
                                        {TELOP_SHORTCUT_KEYS[index]}
                                    </Box>
                                )}
                                {preset.text}
                            </Button>
                        ))}
                    </Box>
                )}
                <Typography variant="caption" sx={{display: 'block', mt: 1, color: 'text.secondary'}}>
                    このページにフォーカスがあるときは、キーボードの 1〜9, 0 でも出せます（入力欄にカーソルがあるときは効きません）。
                </Typography>
                <Box sx={{display: 'flex', gap: 1, alignItems: 'flex-start', mt: 2}}>
                    <TextField
                        label="自由入力"
                        value={freeText}
                        onChange={(e) => setFreeText(e.target.value)}
                        // 変換中の Enter では出さない
                        onKeyDown={(e) => {
                            if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
                            e.preventDefault();
                            void handleShowFreeText();
                        }}
                        error={freeText.trim() !== '' && normalizedFreeText === null}
                        helperText={`${MAX_TELOP_LENGTH} 文字まで。Enter で出します。`}
                        fullWidth
                    />
                    <Button variant="contained" onClick={() => void handleShowFreeText()} disabled={normalizedFreeText === null} sx={{minWidth: '100px'}}>出す</Button>
                </Box>
            </Paper>

            <Paper elevation={12} sx={paperSx}>
                <Typography variant="h6" gutterBottom>🗂️ プリセット</Typography>
                <Box data-testid="telop-preset-editor" sx={{my: 1}}>
                    {presets.map((preset, index) => (
                        <Box key={preset.id} sx={{display: 'flex', alignItems: 'center', gap: 1, borderBottom: '1px dotted rgba(255,255,255,0.2)'}}>
                            <Typography sx={{flex: 1}}>{preset.text}</Typography>
                            <FormControlLabel
                                label="読み上げ"
                                control={
                                    <Checkbox
                                        checked={preset.speak}
                                        onChange={(e) => void savePresets(presets.map((p) => p.id === preset.id ? {...p, speak: e.target.checked} : p))}
                                        slotProps={{input: {'aria-label': `「${preset.text}」を読み上げる`}}}
                                    />
                                }
                            />
                            <IconButton size="small" onClick={() => movePreset(index, -1)} disabled={index === 0} aria-label={`「${preset.text}」を上へ`}>
                                <ArrowUpwardIcon fontSize="small"/>
                            </IconButton>
                            <IconButton size="small" onClick={() => movePreset(index, 1)} disabled={index === presets.length - 1} aria-label={`「${preset.text}」を下へ`}>
                                <ArrowDownwardIcon fontSize="small"/>
                            </IconButton>
                            <IconButton
                                size="small"
                                color="error"
                                onClick={() => void savePresets(presets.filter((p) => p.id !== preset.id))}
                                aria-label={`プリセット「${preset.text}」を削除`}
                            >
                                <RemoveCircleIcon fontSize="small"/>
                            </IconButton>
                        </Box>
                    ))}
                </Box>
                <Box sx={{display: 'flex', gap: 1, alignItems: 'flex-start'}}>
                    <TextField
                        label="新しいプリセット"
                        value={newPreset}
                        onChange={(e) => setNewPreset(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
                            e.preventDefault();
                            handleAddPreset();
                        }}
                        error={newPreset.trim() !== '' && normalizedNewPreset === null}
                        helperText={`${MAX_TELOP_LENGTH} 文字まで。Enter で追加できます。`}
                        fullWidth
                    />
                    <Button variant="contained" onClick={handleAddPreset} disabled={!canAddPreset} sx={{minWidth: '100px'}}>追加</Button>
                </Box>
                <Typography variant="caption" sx={{display: 'block', mt: 1, color: 'text.secondary'}}>
                    最大 {MAX_TELOP_PRESETS} 個。上から順に 1〜9, 0 のキーが割り当てられます。「読み上げ」は合成音声（VOICEVOX）対応後に使われます。変更はすぐに保存されます。
                </Typography>
            </Paper>
        </>
    );
};

export default TelopPanel;
