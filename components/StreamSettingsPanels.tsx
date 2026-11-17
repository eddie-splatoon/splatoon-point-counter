'use client';

import ChatRoundedIcon from '@mui/icons-material/ChatRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import TextFieldsRoundedIcon from '@mui/icons-material/TextFieldsRounded';
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
    TextField,
    Typography,
} from '@mui/material';
import React, {useMemo, useState} from 'react';

import {BurndownData, StreamSettings, TransitionEffect, isValidStreamSetting} from '../lib/streamSettingsTypes';

import ChoiceChip from './ChoiceChip';
import LiveCard from './LiveCard';
import SectionTitle from './SectionTitle';
import {StreamSettingsState} from './useStreamSettings';

// /api/stream-data の設定を扱うコントロールパネルのカード。設定は useStreamSettings で、
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

const subheadSx = {fontSize: 12, fontWeight: 700, color: 'text.secondary', mt: 5, mb: 3.5} as const;
const listRowSx = {display: 'flex', alignItems: 'center', gap: 2, minHeight: 40, borderTop: '1px solid #232832'} as const;

const MessageSettings: React.FC<CardProps> = ({settings, update}) => {
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
        <>
            <Box role="radiogroup" aria-label="メッセージのプリセット" sx={{display: 'flex', flexWrap: 'wrap', gap: 1.5}}>
                {settings.messagePresets.map((preset) => (
                    <ChoiceChip key={preset.name} kind="radio" selected={preset.name === settings.activePresetName} onClick={() => update({activePresetName: preset.name})}>
                        {preset.name}
                    </ChoiceChip>
                ))}
            </Box>
            <Box component="ul" aria-label="流すメッセージ" sx={{listStyle: 'none', m: 0, mt: 3, p: 0, maxHeight: 200, overflowY: 'auto'}}>
                {!activePreset || activePreset.messages.length === 0 ? (
                    <Typography component="li" variant="body2" sx={{color: 'text.secondary', py: 2}}>メッセージがありません</Typography>
                ) : (
                    activePreset.messages.map((msg) => (
                        <Box component="li" key={msg.id} sx={listRowSx}>
                            <Typography component="span" sx={{flex: 1, fontSize: 14}}>{msg.text}</Typography>
                            <IconButton size="small" aria-label={`${msg.text} を消す`} onClick={() => setMessages(activePreset.messages.filter((m) => m.id !== msg.id))} sx={{color: 'text.secondary'}}>
                                <CloseRoundedIcon fontSize="small"/>
                            </IconButton>
                        </Box>
                    ))
                )}
            </Box>
            <Box sx={{display: 'flex', gap: 2, alignItems: 'center', mt: 2}}>
                <TextField
                    size="small"
                    label="新しいメッセージ"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && handleAdd()}
                    fullWidth
                />
                <Button variant="outlined" onClick={handleAdd} disabled={message.trim() === ''} sx={{flex: 'none'}}>追加</Button>
            </Box>
        </>
    );
};

const BurndownSettings: React.FC<CardProps> = ({settings, update}) => {
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
        <>
            <Box sx={{display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 2.5}}>
                <TextField size="small" label="バーンダウンの名前" placeholder="例: 金イクラ" value={settings.burndown.label} onChange={(e) => updateBurndown({label: e.target.value})} multiline maxRows={2}/>
                <TextField size="small" label="目標値" type="number" value={settings.burndown.targetValue} onChange={(e) => updateBurndown({targetValue: Number(e.target.value)})}/>
            </Box>
            <Box sx={{display: 'flex', gap: 2, alignItems: 'center', mt: 3}}>
                <TextField
                    size="small"
                    label="新しいポイント"
                    type="number"
                    value={newScore}
                    onChange={(e) => setNewScore(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                    fullWidth
                />
                <Button variant="outlined" onClick={handleAdd} disabled={newScore.trim() === ''} sx={{flex: 'none'}}>ポイントを追加</Button>
            </Box>
            <Box sx={{display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mt: 3}}>
                <Typography sx={{fontSize: 12, color: 'text.secondary'}}>ポイントの履歴</Typography>
                <Typography sx={{fontSize: 13}}>合計 <Box component="strong" sx={{fontSize: 18}}>{total.toLocaleString()}</Box> / {settings.burndown.targetValue.toLocaleString()}</Typography>
            </Box>
            <Box data-testid="burndown-history" sx={{maxHeight: 160, overflowY: 'auto'}}>
                {settings.burndown.entries.length === 0 ? (
                    <Typography variant="body2" sx={{color: 'text.secondary', py: 2}}>履歴がありません</Typography>
                ) : (
                    settings.burndown.entries.map((entry, index) => (
                        <Box key={entry.timestamp} sx={listRowSx}>
                            <Typography component="span" sx={{flex: 1, fontSize: 13}}>
                                {index + 1}. {entry.score.toLocaleString()}（{new Date(entry.timestamp).toLocaleString('ja-JP', {month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false})}）
                            </Typography>
                            <IconButton size="small" aria-label={`ポイント ${entry.score} を消す`} onClick={() => updateBurndown({entries: settings.burndown.entries.filter((e) => e.timestamp !== entry.timestamp)})} sx={{color: 'text.secondary'}}>
                                <CloseRoundedIcon fontSize="small"/>
                            </IconButton>
                        </Box>
                    ))
                )}
            </Box>
        </>
    );
};

/** 準備の画面の「流すメッセージ・バーンダウン」（メッセージのプリセットの選択・メッセージの追加・削除、バーンダウンの名前・目標値・ポイント） */
export const MessageBurndownCard: React.FC<CardProps> = (props) => (
    <LiveCard icon={ChatRoundedIcon} title="流すメッセージ・バーンダウン">
        <MessageSettings {...props}/>
        <Typography sx={subheadSx}>バーンダウン</Typography>
        <BurndownSettings {...props}/>
    </LiveCard>
);

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
