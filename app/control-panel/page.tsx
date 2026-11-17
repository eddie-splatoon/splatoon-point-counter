'use client';

import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import RemoveCircleIcon from '@mui/icons-material/RemoveCircle';
import TextFieldsRoundedIcon from '@mui/icons-material/TextFieldsRounded';
import {
    TextField,
    Button,
    Select,
    MenuItem,
    InputLabel,
    FormControl,
    Box,
    Paper,
    Typography,
    IconButton,
    Tabs,
    Tab,
    Alert,
    AlertTitle,
} from '@mui/material';
import {ThemeProvider} from '@mui/material/styles';
import axios from 'axios';
import Image from 'next/image';
import React, {useState, useEffect, useMemo, useCallback, useRef} from 'react';

import ClipPanel from '../../components/ClipPanel';
import JoinQueuePanel from '../../components/JoinQueuePanel';
import SalmonRunPanel from '../../components/SalmonRunPanel';
import ScoreDisplayPanel from '../../components/ScoreDisplayPanel';
import SectionTitle from '../../components/SectionTitle';
import SidePanelSettingsPanel from '../../components/SidePanelSettingsPanel';
import TelopBar from '../../components/TelopBar';
import TelopPanel from '../../components/TelopPanel';
import VoiceSettingsPanel from '../../components/VoiceSettingsPanel';
import WeaponCardPanel from '../../components/WeaponCardPanel';
import {getItem, setItem} from '../../lib/localStorage';
import {BurndownData, STREAM_SETTINGS_KEYS, StreamSettings, TransitionEffect, isValidStreamSetting} from '../../lib/streamSettingsTypes';
import {StreamData} from '../api/stream-data/route';

import {monoFontFamily, theme, tokens} from './theme';

// OBS のブラウザソースの URL
const codeStyle: React.CSSProperties = {backgroundColor: tokens.color.surface2, padding: '2px 6px', borderRadius: tokens.radius.badge, fontFamily: monoFontFamily};

// localStorage には開いているタブだけを残す（設定はサーバーの SQLite に保存する）。
// 以前は設定もここに入れていたので、残っていれば 1 回だけサーバーに移して消す
const LOCAL_STORAGE_KEY = 'control-panel-state';
// 入力が止まってから保存するまでの時間
const SAVE_DELAY_MS = 500;

interface StoredPanelState {
    activeTab?: unknown;
}

const pickSettings = (data: StreamSettings): StreamSettings =>
    Object.fromEntries(STREAM_SETTINGS_KEYS.map((key) => [key, data[key]])) as unknown as StreamSettings;

/** 保存済みの値と比べて変わった項目のうち、送れる値のものだけ（入力途中の不正な値は送らない） */
const changedSettings = (current: StreamSettings, saved: StreamSettings): Partial<StreamSettings> =>
    Object.fromEntries(STREAM_SETTINGS_KEYS
        .filter((key) => JSON.stringify(current[key]) !== JSON.stringify(saved[key]) && isValidStreamSetting(key, current[key]))
        .map((key) => [key, current[key]]));

/** 以前 localStorage に入れていた設定のうち、形が正しいものだけ */
const legacySettings = (stored: unknown): Partial<StreamSettings> => {
    if (typeof stored !== 'object' || stored === null) return {};
    const record = stored as Record<string, unknown>;
    return Object.fromEntries(STREAM_SETTINGS_KEYS
        .filter((key) => key in record && isValidStreamSetting(key, record[key]))
        .map((key) => [key, record[key]]));
};

const readStoredPanelState = (): StoredPanelState | null => {
    try {
        return getItem<StoredPanelState>(LOCAL_STORAGE_KEY);
    } catch {
        // 壊れていたら捨てる（入っているのはタブだけなので、読めなくても困らない）
        return null;
    }
};

const ControlPanelPage: React.FC = () => {
    const [effectStatus, setEffectStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    // テロップタブでプリセットを編集したら、上部のテロップバーに読み込み直させる
    const [telopPresetsRevision, setTelopPresetsRevision] = useState(0);
    const [origin, setOrigin] = useState<string>('');
    const [activeTab, setActiveTab] = useState('score');
    const [loadError, setLoadError] = useState(false);
    const [saveError, setSaveError] = useState(false);

    // オーバーレイの設定。変えるとその場で（少し待って）保存する
    const [settings, setSettings] = useState<StreamSettings | null>(null);
    // サーバーに保存済みの値（変わった項目だけを送るために比べる）
    const savedRef = useRef<StreamSettings | null>(null);
    const settingsRef = useRef<StreamSettings | null>(null);
    // 保存は 1 つずつ順に送る（前の保存の結果で savedRef を更新してから次を比べる）
    const savingRef = useRef<Promise<void>>(Promise.resolve());

    // Temp state for burndown new entry
    const [newBurndownScore, setNewBurndownScore] = useState('');

    // Message scroller temporary state
    const [currentMessage, setCurrentMessage] = useState<string>('');

    // Helper to parse burndown entries and calculate total
    const totalEntries = useMemo(() => {
        return settings?.burndown.entries.reduce((sum, current) => sum + current.score, 0) || 0;
    }, [settings?.burndown.entries]);

    const handleTriggerEffect = useCallback(async (effectName: string) => {
        if (effectStatus === 'loading') return; // Prevent spamming
        setEffectStatus('loading');
        try {
            // エフェクトだけを送る（ほかの設定は送らない）
            const res = await axios.patch('/api/stream-data', {event: effectName});
            if (res.status === 200) setEffectStatus('success');
            else setEffectStatus('error');
        } catch {
            setEffectStatus('error');
        } finally {
            setTimeout(() => setEffectStatus('idle'), 2000);
        }
    }, [effectStatus]);

    // --- Handlers ---
    const updateSettings = (delta: Partial<StreamSettings>) => {
        setSettings(prev => prev ? {...prev, ...delta} : null);
    };

    const updateBurndown = (delta: Partial<BurndownData>) => {
        if (!settings) return;
        updateSettings({burndown: {...settings.burndown, ...delta}});
    };

    const changeTab = (tab: string) => {
        setActiveTab(tab);
        setItem(LOCAL_STORAGE_KEY, {activeTab: tab});
    };

    // 保存していない変更を送る
    const save = useCallback(() => {
        savingRef.current = savingRef.current.then(async () => {
            const current = settingsRef.current;
            const saved = savedRef.current;
            if (!current || !saved) return;
            const update = changedSettings(current, saved);
            if (Object.keys(update).length === 0) return;
            try {
                await axios.post('/api/stream-data', update);
                savedRef.current = {...saved, ...update};
                setSaveError(false);
            } catch {
                setSaveError(true);
            }
        });
    }, []);

    // --- Effects ---
    // Initialization Effect
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setOrigin(window.location.origin);
        const stored = readStoredPanelState();
        if (typeof stored?.activeTab === 'string') setActiveTab(stored.activeTab);

        const load = async () => {
            const res = await axios.get<StreamData>('/api/stream-data');
            let loaded = pickSettings(res.data);
            const legacy = legacySettings(stored);
            if (Object.keys(legacy).length > 0) {
                // サーバーに保存が無いときだけ、以前の localStorage の設定を移す（保存済みなら、そちらのほうが新しい）
                if (!res.data.settingsStored) {
                    const migrated = await axios.post<StreamData>('/api/stream-data', legacy);
                    loaded = pickSettings(migrated.data);
                }
                setItem(LOCAL_STORAGE_KEY, {activeTab: stored?.activeTab});
            }
            savedRef.current = loaded;
            settingsRef.current = loaded;
            setSettings(loaded);
        };
        load().catch((e) => {
            console.error('Failed to load the settings', e);
            setLoadError(true);
        });
    }, []);

    // 変えたら少し待って保存する（入力のたびには送らない）
    useEffect(() => {
        settingsRef.current = settings;
        if (!settings) return;
        const timer = setTimeout(save, SAVE_DELAY_MS);
        return () => clearTimeout(timer);
    }, [settings, save]);

    // 画面を離れるときは、待っている変更をすぐに送る
    useEffect(() => {
        // タブを閉じる・再読み込みするとき。ページが消えても送り終えるよう keepalive で送る
        const handlePageHide = () => {
            const current = settingsRef.current;
            const saved = savedRef.current;
            if (!current || !saved) return;
            const update = changedSettings(current, saved);
            if (Object.keys(update).length === 0) return;
            void fetch('/api/stream-data', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(update),
                keepalive: true,
            }).catch(() => undefined);
        };
        window.addEventListener('pagehide', handlePageHide);
        return () => {
            window.removeEventListener('pagehide', handlePageHide);
            // アプリの中でほかの画面に移るとき
            save();
        };
    }, [save]);

    const handleAddMessage = () => {
        if (currentMessage.trim() !== '' && settings) {
            const activePreset = settings.messagePresets.find(p => p.name === settings.activePresetName);
            if (!activePreset) return;
            const updatedMessages = [...activePreset.messages, {id: Date.now(), text: currentMessage.trim()}];
            const updatedPresets = settings.messagePresets.map(preset =>
                preset.name === settings.activePresetName ? {...preset, messages: updatedMessages} : preset
            );
            updateSettings({messagePresets: updatedPresets});
            setCurrentMessage('');
        }
    };

    const handleRemoveMessage = (id: number) => {
        if (!settings) return;
        const activePreset = settings.messagePresets.find(p => p.name === settings.activePresetName);
        if (!activePreset) return;
        const updatedMessages = activePreset.messages.filter(msg => msg.id !== id);
        const updatedPresets = settings.messagePresets.map(preset =>
            preset.name === settings.activePresetName ? {...preset, messages: updatedMessages} : preset
        );
        updateSettings({messagePresets: updatedPresets});
    };

    const handleAddBurndownEntry = () => {
        const score = Number(newBurndownScore);
        if (isNaN(score) || score <= 0 || !settings) return;
        const newEntry = { score, timestamp: Date.now() };
        updateBurndown({ entries: [...settings.burndown.entries, newEntry] });
        setNewBurndownScore('');
    };

    const handleRemoveBurndownEntry = (timestamp: number) => {
        if (!settings) return;
        updateBurndown({ entries: settings.burndown.entries.filter(e => e.timestamp !== timestamp) });
    };

    if (!settings) {
        return (
             <ThemeProvider theme={theme}>
                 <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', color: 'text.primary', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    {loadError ? (
                        <Alert severity="error" action={
                            <Button color="inherit" size="small" onClick={() => window.location.reload()}>
                                読み込み直す
                            </Button>
                        }>
                            <AlertTitle>エラー</AlertTitle>
                            設定を読み込めませんでした。サーバーが起動しているか確認してください。
                        </Alert>
                    ) : (
                        <Typography>読み込み中...</Typography>
                    )}
                </Box>
            </ThemeProvider>
        );
    }
    
    return (
        <ThemeProvider theme={theme}>
            {/* hidden だとスクロール領域になり、テロップバーの sticky が効かないので clip ではみ出しだけ切る */}
            <Box sx={{minHeight: '100vh', bgcolor: 'background.default', color: 'text.primary', position: 'relative', overflow: 'clip'}}>
                <Box sx={{p: 5, maxWidth: 700, margin: 'auto', position: 'relative', zIndex: 1}}>
                    <Box sx={{display: 'flex', alignItems: 'center', gap: 3, mb: 4}}>
                        <Image src="/favicon.svg" alt="icon" width={32} height={32}/>
                        <Typography variant="h1" sx={{color: 'text.primary'}}>
                            配信オーバーレイ設定パネル
                        </Typography>
                    </Box>

                    {/* 設定は変えるとその場で保存する。失敗したときだけ知らせる（次に変えたときに送り直す） */}
                    {saveError && (
                        <Alert severity="error" role="status" sx={{mb: 4}}>
                            設定を保存できませんでした。サーバーが起動しているか確認してください（次に変えたときに送り直します）。
                        </Alert>
                    )}

                    <TelopBar reloadKey={telopPresetsRevision}/>

                    <Tabs value={activeTab} onChange={(e, newValue) => changeTab(newValue)} variant="scrollable" scrollButtons="auto" sx={{mb: 4}}>
                        <Tab label="スコア表示" value="score"/>
                        <Tab label="バーンダウン" value="burndown"/>
                        <Tab label="メッセージ" value="message"/>
                        <Tab label="サーモンラン" value="salmon"/>
                        <Tab label="ブキ埋め" value="weaponCard"/>
                        <Tab label="サイドパネル" value="sidePanel"/>
                        <Tab label="テロップ" value="telop"/>
                        <Tab label="クリップ" value="clip"/>
                        <Tab label="参加" value="joinQueue"/>
                        <Tab label="共通設定" value="common"/>
                    </Tabs>

                    {activeTab === 'score' && <ScoreDisplayPanel/>}

                    {activeTab === 'burndown' && (
                        <Paper sx={{p: 4}}>
                            <Typography variant="h6" gutterBottom>バーンダウンチャート設定</Typography>
                            <TextField label="フィールド名" value={settings.burndown.label} onChange={(e) => updateBurndown({ label: e.target.value })} fullWidth margin="normal" variant="outlined" multiline rows={2}/>
                            <TextField label="目標値" type="number" value={settings.burndown.targetValue} onChange={(e) => updateBurndown({ targetValue: Number(e.target.value) })} fullWidth margin="normal" variant="outlined"/>

                            <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>ポイント履歴</Typography>
                            <Box data-testid="burndown-history" sx={{my: 2, maxHeight: 200, overflowY: 'auto', p: 1, bgcolor: 'rgba(255, 255, 255, 0.03)', borderRadius: '4px'}}>
                                {settings.burndown.entries.length === 0 ? (
                                    <Typography
                                        variant="body2"
                                        sx={{
                                            color: "text.secondary",
                                            p: 1
                                        }}>履歴がありません</Typography>
                                ) : (
                                    settings.burndown.entries.map((entry, index) => (
                                        <Box key={entry.timestamp} sx={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 0.5, borderBottom: '1px dotted rgba(255,255,255,0.2)'}}>
                                            <Typography variant="body1">{index + 1} | {entry.score} | {new Date(entry.timestamp).toLocaleString('ja-JP', {year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false}).replace(/\//g, '/')}</Typography>
                                            <IconButton size="small" color="error" onClick={() => handleRemoveBurndownEntry(entry.timestamp)} aria-label={`remove entry ${entry.score}`}><RemoveCircleIcon fontSize="small"/></IconButton>
                                        </Box>
                                    ))
                                )}
                            </Box>
                             <Box sx={{display: 'flex', gap: 1, alignItems: 'center', mb: 2}}>
                                <TextField 
                                    label="新しいポイント" 
                                    type="number"
                                    value={newBurndownScore} 
                                    onChange={(e) => setNewBurndownScore(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddBurndownEntry()}
                                    fullWidth 
                                    variant="outlined"
                                />
                                <Button variant="contained" onClick={handleAddBurndownEntry} disabled={newBurndownScore.trim() === ''} sx={{minWidth: '100px'}}>追加</Button>
                            </Box>
                            
                            <Box sx={{flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', bgcolor: 'rgba(255, 255, 255, 0.03)', borderRadius: '4px', p: 1}}>
                                <Typography variant="h6" color="primary">合計</Typography>
                                <Typography
                                    variant="h4"
                                    sx={{
                                        color: "text.primary",
                                        fontWeight: "bold"
                                    }}>
                                    {totalEntries.toLocaleString()}
                                </Typography>
                            </Box>
                        </Paper>
                    )}

                    {activeTab === 'message' && (
                        <Paper sx={{p: 4}}>
                            <Typography variant="h6" gutterBottom>視聴者向け概要メッセージ</Typography>
                            <Box sx={{borderBottom: 1, borderColor: 'divider', mb: 2}}>
                                <Tabs value={settings.activePresetName} onChange={(e, newValue) => updateSettings({activePresetName: newValue})} variant="scrollable" scrollButtons="auto" aria-label="メッセージプリセット">
                                    {settings.messagePresets.map(preset => (<Tab key={preset.name} label={preset.name} value={preset.name}/>))}
                                </Tabs>
                            </Box>
                            <Box sx={{my: 2, maxHeight: 150, overflowY: 'auto', p: 1, bgcolor: 'rgba(255, 255, 255, 0.03)', borderRadius: '4px'}}>
                                {settings.messagePresets.find(p => p.name === settings.activePresetName)?.messages.length === 0 ? (
                                    <Typography
                                        variant="body2"
                                        sx={{
                                            color: "text.secondary",
                                            p: 1
                                        }}>メッセージがありません</Typography>
                                ) : (
                                    settings.messagePresets.find(p => p.name === settings.activePresetName)?.messages.map((msg) => (
                                        <Box key={msg.id} sx={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 0.5, borderBottom: '1px dotted rgba(255,255,255,0.2)'}}>
                                            <Typography variant="body1">{msg.text}</Typography>
                                            <IconButton size="small" color="error" onClick={() => handleRemoveMessage(msg.id)}><RemoveCircleIcon fontSize="small"/></IconButton>
                                        </Box>
                                    ))
                                )}
                            </Box>
                            <Box sx={{display: 'flex', gap: 1, alignItems: 'center', mb: 2}}>
                                <TextField label="新しいメッセージ" value={currentMessage} onChange={(e) => setCurrentMessage(e.target.value)} fullWidth variant="outlined"/>
                                <Button variant="contained" onClick={handleAddMessage} disabled={currentMessage.trim() === ''} sx={{minWidth: '100px'}}>追加</Button>
                            </Box>
                            <FormControl fullWidth margin="normal">
                                <InputLabel>切り替えエフェクト</InputLabel>
                                <Select value={settings.transitionEffect} label="切り替えエフェクト" onChange={(e) => updateSettings({transitionEffect: e.target.value as TransitionEffect})}>
                                    <MenuItem value={'fade'}>フェード</MenuItem>
                                    <MenuItem value={'slide'}>スライド</MenuItem>
                                </Select>
                            </FormControl>
                            <TextField label="表示秒数 (秒)" type="number" value={settings.transitionDuration} onChange={(e) => updateSettings({transitionDuration: Number(e.target.value)})} fullWidth margin="normal" slotProps={{htmlInput: {min: 1}}} variant="outlined"/>
                        </Paper>
                    )}

                    {activeTab === 'salmon' && <SalmonRunPanel/>}

                    {activeTab === 'weaponCard' && <WeaponCardPanel/>}

                    {activeTab === 'sidePanel' && <SidePanelSettingsPanel/>}

                    {activeTab === 'clip' && <ClipPanel/>}
                    {activeTab === 'joinQueue' && <JoinQueuePanel/>}

                    {activeTab === 'telop' && (
                        <>
                            <TelopPanel onPresetsChange={() => setTelopPresetsRevision((n) => n + 1)}/>
                            <VoiceSettingsPanel/>
                        </>
                    )}

                    {activeTab === 'common' && (
                        <>
                            <Paper sx={{mb: 4, p: 4}}>
                                <SectionTitle icon={AutoAwesomeRoundedIcon}>演出効果</SectionTitle>
                                <Box sx={{display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap'}}>
                                    <Button variant="contained" color="primary" onClick={() => handleTriggerEffect('LOVE')} disabled={effectStatus === 'loading'}>💖 LOVE</Button>
                                    <Button variant="contained" color="secondary" onClick={() => handleTriggerEffect('STAR')} disabled={effectStatus === 'loading'}>⭐ STAR</Button>
                                    <Button variant="contained" color="secondary" onClick={() => handleTriggerEffect('SPARKLE')} disabled={effectStatus === 'loading'}>✨ SPARKLE</Button>
                                    <Button variant="contained" color="secondary" onClick={() => handleTriggerEffect('BUBBLE')} disabled={effectStatus === 'loading'}>🫧 BUBBLE</Button>
                                    {effectStatus === 'success' && (<Typography variant="body2" sx={{
                                        color: "success.main"
                                    }}>送信完了</Typography>)}
                                    {effectStatus === 'error' && (<Typography variant="body2" sx={{
                                        color: "error.main"
                                    }}>送信失敗</Typography>)}
                                </Box>
                                <Typography
                                    variant="caption"
                                    sx={{
                                        display: "block",
                                        mt: 2,
                                        color: 'text.secondary'
                                    }}>
                                    ボタンを押すと、OBSのスコア表示オーバーレイにエフェクトが表示されます。
                                    文字起こし（pnpm caption）の起動中は、話した言葉でも出ます: 「ナイス」→ ⭐, 「ありがとう」→ 💖, 「よっしゃ」→ ✨, 「やべぇ」→ 🫧
                                </Typography>
                            </Paper>
                            <Paper sx={{mb: 4, p: 4}}>
                                <SectionTitle icon={TextFieldsRoundedIcon}>フォント設定</SectionTitle>
                                <TextField label="フォント名 (CSS font-family)" value={settings.fontFamily} onChange={(e) => updateSettings({fontFamily: e.target.value})} fullWidth margin="normal" helperText="システムフォントや、OBS側でカスタムフォントがインストールされているフォント名を入力" variant="outlined"/>
                                <TextField label="フォントサイズ (px)" type="number" value={settings.fontSize} onChange={(e) => updateSettings({fontSize: Number(e.target.value)})} fullWidth margin="normal" slotProps={{htmlInput: {min: 1}}} variant="outlined"/>
                            </Paper>
                        </>
                    )}

                    <Box sx={{mt: 8, p: 4, border: 1, borderStyle: 'dashed', borderColor: tokens.color.borderStrong, borderRadius: `${tokens.radius.card}px`}}>
                        <Typography variant="body2" sx={{
                            fontWeight: "bold"
                        }}>OBSブラウザソース設定</Typography>
                        <Typography variant="body2">スコア表示URL: <code style={codeStyle}>{origin}/obs-overlay</code></Typography>
                        <Typography variant="body2">バーンダウン表示URL: <code style={codeStyle}>{origin}/burndown-overlay</code></Typography>
                        <Typography variant="body2">サイドパネル表示URL: <code style={codeStyle}>{origin}/side-panel-overlay</code></Typography>
                        <Typography variant="body2">幅: 1450, 高さ: 160 (スコア表示)</Typography>
                        <Typography variant="body2">幅: 250, 高さ: 584 (バーンダウン表示・サイドパネル表示)</Typography>
                    </Box>
                </Box>
            </Box>
        </ThemeProvider>
    );
};

export default ControlPanelPage;