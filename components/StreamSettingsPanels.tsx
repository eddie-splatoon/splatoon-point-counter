'use client';

import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import ChatRoundedIcon from '@mui/icons-material/ChatRounded';
import RemoveCircleIcon from '@mui/icons-material/RemoveCircle';
import TextFieldsRoundedIcon from '@mui/icons-material/TextFieldsRounded';
import TrendingDownRoundedIcon from '@mui/icons-material/TrendingDownRounded';
import {
    Alert,
    AlertTitle,
    Box,
    Button,
    FormControl,
    IconButton,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    Tab,
    Tabs,
    TextField,
    Typography,
} from '@mui/material';
import axios from 'axios';
import React, {useCallback, useMemo, useState} from 'react';

import {BurndownData, StreamSettings, TransitionEffect, isValidStreamSetting} from '../lib/streamSettingsTypes';

import SectionTitle from './SectionTitle';
import {StreamSettingsState} from './useStreamSettings';

// /api/stream-data の設定（とエフェクト）を扱うコントロールパネルのカード。設定は useStreamSettings で、
// 画面ごとに 1 回だけ読み込んで各カードに渡す

const paperSx = {mb: 4, p: 4};
// 不正な値（数値の欄を空にしたときの 0 など）は保存しないので、欄に出す
const NOT_SAVED_TEXT = 'この値は保存されません（1 以上の、大きすぎない数を入れてください）';

interface CardProps {
    settings: StreamSettings;
    update: StreamSettingsState['update'];
}

/** 設定を読み込むまで・読み込めなかったときの表示。読み込めたら children(settings) を出す */
export const StreamSettingsGate: React.FC<{state: StreamSettingsState; children: (settings: StreamSettings) => React.ReactNode}> = ({state, children}) => {
    if (state.settings) return <>{children(state.settings)}</>;
    if (state.loadError) {
        return (
            <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => window.location.reload()}>読み込み直す</Button>}>
                <AlertTitle>エラー</AlertTitle>
                設定を読み込めませんでした。サーバーが起動しているか確認してください。
            </Alert>
        );
    }
    return <Typography sx={{color: 'text.secondary'}}>読み込み中...</Typography>;
};

export const BurndownSettingsCard: React.FC<CardProps> = ({settings, update}) => {
    const [newScore, setNewScore] = useState('');
    const total = useMemo(() => settings.burndown.entries.reduce((sum, e) => sum + e.score, 0), [settings.burndown.entries]);
    const updateBurndown = (delta: Partial<BurndownData>) => update({burndown: {...settings.burndown, ...delta}});

    const handleAdd = () => {
        const score = Number(newScore);
        if (isNaN(score) || score <= 0) return;
        updateBurndown({entries: [...settings.burndown.entries, {score, timestamp: Date.now()}]});
        setNewScore('');
    };

    return (
        <Paper sx={paperSx}>
            <SectionTitle icon={TrendingDownRoundedIcon}>バーンダウンチャート設定</SectionTitle>
            <TextField label="フィールド名" value={settings.burndown.label} onChange={(e) => updateBurndown({label: e.target.value})} fullWidth margin="normal" variant="outlined" multiline rows={2}/>
            <TextField label="目標値" type="number" value={settings.burndown.targetValue} onChange={(e) => updateBurndown({targetValue: Number(e.target.value)})} fullWidth margin="normal" variant="outlined"/>

            <Typography variant="h6" gutterBottom sx={{mt: 4}}>ポイント履歴</Typography>
            <Box data-testid="burndown-history" sx={{my: 4, maxHeight: 200, overflowY: 'auto', p: 2, bgcolor: 'background.default', borderRadius: 1}}>
                {settings.burndown.entries.length === 0 ? (
                    <Typography variant="body2" sx={{color: 'text.secondary', p: 2}}>履歴がありません</Typography>
                ) : (
                    settings.burndown.entries.map((entry, index) => (
                        <Box key={entry.timestamp} sx={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 1, borderBottom: 1, borderColor: 'divider'}}>
                            <Typography variant="body1">{index + 1} | {entry.score} | {new Date(entry.timestamp).toLocaleString('ja-JP', {year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false})}</Typography>
                            <IconButton size="small" color="error" onClick={() => updateBurndown({entries: settings.burndown.entries.filter((e) => e.timestamp !== entry.timestamp)})} aria-label={`remove entry ${entry.score}`}><RemoveCircleIcon fontSize="small"/></IconButton>
                        </Box>
                    ))
                )}
            </Box>
            <Box sx={{display: 'flex', gap: 2, alignItems: 'center', mb: 4}}>
                <TextField
                    label="新しいポイント"
                    type="number"
                    value={newScore}
                    onChange={(e) => setNewScore(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                    fullWidth
                    variant="outlined"
                />
                <Button variant="contained" onClick={handleAdd} disabled={newScore.trim() === ''} sx={{minWidth: '100px'}}>追加</Button>
            </Box>
            <Box sx={{display: 'flex', flexDirection: 'column', alignItems: 'center', bgcolor: 'background.default', borderRadius: 1, p: 2}}>
                <Typography variant="h6" color="primary">合計</Typography>
                <Typography variant="h4" sx={{fontWeight: 'bold'}}>{total.toLocaleString()}</Typography>
            </Box>
        </Paper>
    );
};

export const MessageSettingsCard: React.FC<CardProps> = ({settings, update}) => {
    const [message, setMessage] = useState('');
    const activePreset = settings.messagePresets.find((p) => p.name === settings.activePresetName);

    const setMessages = (messages: {id: number; text: string}[]) => update({
        messagePresets: settings.messagePresets.map((p) => p.name === settings.activePresetName ? {...p, messages} : p),
    });

    const handleAdd = () => {
        if (message.trim() === '' || !activePreset) return;
        const added = {id: Date.now(), text: message.trim()};
        update({
            messagePresets: settings.messagePresets.map((p) => p.name === settings.activePresetName ? {...p, messages: [...p.messages, added]} : p),
        });
        setMessage('');
    };

    return (
        <Paper sx={paperSx}>
            <SectionTitle icon={ChatRoundedIcon}>視聴者向け概要メッセージ</SectionTitle>
            <Box sx={{borderBottom: 1, borderColor: 'divider', mb: 2}}>
                <Tabs value={settings.activePresetName} onChange={(e, value) => update({activePresetName: value})} variant="scrollable" scrollButtons="auto" aria-label="メッセージプリセット">
                    {settings.messagePresets.map((preset) => <Tab key={preset.name} label={preset.name} value={preset.name}/>)}
                </Tabs>
            </Box>
            <Box sx={{my: 4, maxHeight: 150, overflowY: 'auto', p: 2, bgcolor: 'background.default', borderRadius: 1}}>
                {!activePreset || activePreset.messages.length === 0 ? (
                    <Typography variant="body2" sx={{color: 'text.secondary', p: 2}}>メッセージがありません</Typography>
                ) : (
                    activePreset.messages.map((msg) => (
                        <Box key={msg.id} sx={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 1, borderBottom: 1, borderColor: 'divider'}}>
                            <Typography variant="body1">{msg.text}</Typography>
                            <IconButton size="small" color="error" aria-label={`${msg.text} を消す`} onClick={() => setMessages(activePreset.messages.filter((m) => m.id !== msg.id))}><RemoveCircleIcon fontSize="small"/></IconButton>
                        </Box>
                    ))
                )}
            </Box>
            <Box sx={{display: 'flex', gap: 2, alignItems: 'center'}}>
                <TextField label="新しいメッセージ" value={message} onChange={(e) => setMessage(e.target.value)} fullWidth variant="outlined"/>
                <Button variant="contained" onClick={handleAdd} disabled={message.trim() === ''} sx={{minWidth: '100px'}}>追加</Button>
            </Box>
        </Paper>
    );
};

/** オーバーレイの見た目（フォント・メッセージの切り替え） */
export const AppearanceSettingsCard: React.FC<CardProps> = ({settings, update}) => (
    <Paper sx={paperSx}>
        <SectionTitle icon={TextFieldsRoundedIcon}>見た目</SectionTitle>
        <TextField label="フォント名 (CSS font-family)" value={settings.fontFamily} onChange={(e) => update({fontFamily: e.target.value})} fullWidth margin="normal" helperText="システムフォントや、OBS側でカスタムフォントがインストールされているフォント名を入力" variant="outlined"/>
        <TextField label="フォントサイズ (px)" type="number" value={settings.fontSize} onChange={(e) => update({fontSize: Number(e.target.value)})} error={!isValidStreamSetting('fontSize', settings.fontSize)} helperText={isValidStreamSetting('fontSize', settings.fontSize) ? undefined : NOT_SAVED_TEXT} fullWidth margin="normal" slotProps={{htmlInput: {min: 1}}} variant="outlined"/>
        <FormControl fullWidth margin="normal">
            <InputLabel>メッセージの切り替えエフェクト</InputLabel>
            <Select value={settings.transitionEffect} label="メッセージの切り替えエフェクト" onChange={(e) => update({transitionEffect: e.target.value as TransitionEffect})}>
                <MenuItem value="fade">フェード</MenuItem>
                <MenuItem value="slide">スライド</MenuItem>
            </Select>
        </FormControl>
        <TextField label="表示秒数 (秒)" type="number" value={settings.transitionDuration} onChange={(e) => update({transitionDuration: Number(e.target.value)})} error={!isValidStreamSetting('transitionDuration', settings.transitionDuration)} helperText={isValidStreamSetting('transitionDuration', settings.transitionDuration) ? undefined : NOT_SAVED_TEXT} fullWidth margin="normal" slotProps={{htmlInput: {min: 1}}} variant="outlined"/>
    </Paper>
);

const EFFECT_BUTTONS = [
    {name: 'LOVE', label: '💖 LOVE', color: 'primary'},
    {name: 'STAR', label: '⭐ STAR', color: 'secondary'},
    {name: 'SPARKLE', label: '✨ SPARKLE', color: 'secondary'},
    {name: 'BUBBLE', label: '🫧 BUBBLE', color: 'secondary'},
] as const;

/** エフェクトのボタン。エフェクトだけを PATCH で送る（設定は送らない） */
export const EffectButtonsCard: React.FC = () => {
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

    const trigger = useCallback(async (name: string) => {
        if (status === 'loading') return;
        setStatus('loading');
        try {
            const res = await axios.patch('/api/stream-data', {event: name});
            setStatus(res.status === 200 ? 'success' : 'error');
        } catch {
            setStatus('error');
        } finally {
            setTimeout(() => setStatus('idle'), 2000);
        }
    }, [status]);

    return (
        <Paper sx={paperSx}>
            <SectionTitle icon={AutoAwesomeRoundedIcon}>演出効果</SectionTitle>
            <Box sx={{display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap'}}>
                {EFFECT_BUTTONS.map(({name, label, color}) => (
                    <Button key={name} variant="contained" color={color} onClick={() => void trigger(name)} disabled={status === 'loading'}>{label}</Button>
                ))}
                {status === 'success' && <Typography variant="body2" sx={{color: 'success.main'}}>送信完了</Typography>}
                {status === 'error' && <Typography variant="body2" sx={{color: 'error.main'}}>送信失敗</Typography>}
            </Box>
            <Typography variant="caption" sx={{display: 'block', mt: 2, color: 'text.secondary'}}>
                ボタンを押すと、OBSのスコア表示オーバーレイにエフェクトが表示されます。
                文字起こし（pnpm caption）の起動中は、話した言葉でも出ます: 「ナイス」→ ⭐, 「ありがとう」→ 💖, 「よっしゃ」→ ✨, 「やべぇ」→ 🫧
            </Typography>
        </Paper>
    );
};
