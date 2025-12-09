'use client';

import React, {useState, useEffect, useRef} from 'react';
import axios from 'axios';
import Image from 'next/image';
import {StreamData, MessagePreset, BurndownData} from '../api/stream-data/route';
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
    Chip,
} from '@mui/material';
import RemoveCircleIcon from '@mui/icons-material/RemoveCircle';
import {createTheme, ThemeProvider} from '@mui/material/styles';

interface MessageItem {
    id: number;
    text: string;
}

// @ts-ignore
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

const darkTheme = createTheme({
    palette: {
        mode: 'dark',
        primary: {
            main: '#FF40A0',
        },
        secondary: {
            main: '#32E675',
        },
        text: {
            primary: '#FFFFFF',
            secondary: 'rgba(255, 255, 255, 0.7)',
        },
        background: {
            paper: 'rgba(255, 255, 255, 0.05)',
            default: '#121212',
        },
    },
    components: {
        MuiOutlinedInput: {
            styleOverrides: {
                root: {
                    '& .MuiOutlinedInput-notchedOutline': {
                        borderColor: 'rgba(255, 255, 255, 0.2)',
                    },
                    '&:hover .MuiOutlinedInput-notchedOutline': {
                        borderColor: 'rgba(255, 255, 255, 0.5)',
                    },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#FF40A0',
                    },
                    '& .MuiInputBase-input': {
                        color: '#FFFFFF',
                    },
                },
            },
        },
        MuiInputLabel: {
            styleOverrides: {
                root: {
                    color: 'rgba(255, 255, 255, 0.7)',
                    '&.Mui-focused': {
                        color: '#FF40A0',
                    },
                },
            },
        },
        MuiFormHelperText: {
            styleOverrides: {
                root: {
                    color: 'rgba(255, 255, 255, 0.5)',
                },
            },
        },
        MuiSelect: {
            styleOverrides: {
                icon: {
                    color: '#FFFFFF',
                },
            },
        },
        MuiPaper: {
            styleOverrides: {
                root: {
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                },
            },
        },
        MuiTab: {
            styleOverrides: {
                root: {
                    color: 'rgba(255, 255, 255, 0.7)',
                    '&.Mui-selected': {
                        color: '#FF40A0',
                    },
                },
            },
        },
        MuiTabs: {
            styleOverrides: {
                indicator: {
                    backgroundColor: '#FF40A0',
                },
            },
        },
        MuiButton: {
            styleOverrides: {
                containedPrimary: {
                    color: '#FFFFFF',
                    backgroundColor: '#FF40A0',
                    '&:hover': {
                        backgroundColor: '#E6398D',
                    }
                }
            }
        }
    },
});

const ControlPanelPage: React.FC = () => {
    // General state
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [effectStatus, setEffectStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [origin, setOrigin] = useState<string>('');
    const [activeTab, setActiveTab] = useState('score');

    // Score display state
    const [scoreLabel, setScoreLabel] = useState<string>('');
    const [scoreValue, setScoreValue] = useState<string>('0');
    
    // Burndown chart state
    const [burndownLabel, setBurndownLabel] = useState('');
    const [burndownTargetValue, setBurndownTargetValue] = useState(50000);
    const [burndownEntriesText, setBurndownEntriesText] = useState('');

    // Voice recognition state
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    const recognitionRef = useRef<any>(null);

    // Common state
    const [fontFamily, setFontFamily] = useState<string>('');
    const [fontSize, setFontSize] = useState<number>(54);

    // Message scroller state
    const [currentMessage, setCurrentMessage] = useState<string>('');
    const [transitionEffect, setTransitionEffect] = useState<string>('fade');
    const [transitionDuration, setTransitionDuration] = useState<number>(2);
    const [messagePresets, setMessagePresets] = useState<MessagePreset[]>([]);
    const [activePresetName, setActivePresetName] = useState<string>('');

    // --- Effects ---
    useEffect(() => {
        if (typeof window !== 'undefined') {
            setOrigin(window.location.origin);
        }
        const fetchInitialData = async () => {
            try {
                const res = await axios.get<StreamData>('/api/stream-data');
                if (res.status === 200) {
                    const initialData = res.data;
                    setScoreLabel(initialData.scoreLabel);
                    setScoreValue(initialData.scoreValue);
                    setTransitionEffect(initialData.transitionEffect);
                    setTransitionDuration(initialData.transitionDuration);
                    setFontFamily(initialData.fontFamily);
                    setFontSize(initialData.fontSize);
                    setMessagePresets(initialData.messagePresets);
                    setActivePresetName(initialData.activePresetName);
                    
                    if (initialData.burndown) {
                        setBurndownLabel(initialData.burndown.label);
                        setBurndownTargetValue(initialData.burndown.targetValue);
                        setBurndownEntriesText(initialData.burndown.entries.join('\n'));
                    }
                }
            } catch (e) {
                console.error("Failed to fetch initial data", e);
            }
        };
        fetchInitialData();
    }, []);

    // Speech Recognition Effect
    useEffect(() => {
        if (!SpeechRecognition) {
            console.warn("Speech Recognition API is not supported in this browser.");
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.lang = 'ja-JP';
        recognition.interimResults = false;

        recognition.onresult = (event: any) => {
            const lastResult = event.results[event.results.length - 1];
            if (lastResult.isFinal) {
                const text = lastResult[0].transcript.trim();
                setTranscript(text);
                handleVoiceCommand(text);
            }
        };
        
        recognition.onend = () => {
            if (isListening) {
                recognition.start(); // Restart if it was manually stopped
            }
        };

        recognitionRef.current = recognition;

        return () => {
            recognition.stop();
        };
    }, [isListening]); // Rerun this effect if isListening changes, to handle onend logic properly

    // --- Handlers ---
    const updateActiveMessages = (updatedMessages: MessageItem[]) => {
        const updatedPresets = messagePresets.map(preset =>
            preset.name === activePresetName ? {...preset, messages: updatedMessages} : preset
        );
        setMessagePresets(updatedPresets);
    };

    const handleAddMessage = () => {
        if (currentMessage.trim() !== '') {
            const activePreset = messagePresets.find(p => p.name === activePresetName);
            if (!activePreset) return;
            const updatedMessages = [...activePreset.messages, {id: Date.now(), text: currentMessage.trim()}];
            updateActiveMessages(updatedMessages);
            setCurrentMessage('');
        }
    };

    const handleRemoveMessage = (id: number) => {
        const activePreset = messagePresets.find(p => p.name === activePresetName);
        if (!activePreset) return;
        const updatedMessages = activePreset.messages.filter(msg => msg.id !== id);
        updateActiveMessages(updatedMessages);
    };
    
    const getPayload = () => {
        const burndownEntries = burndownEntriesText.split('\n').map(s => Number(s.trim())).filter(n => !isNaN(n) && n > 0);
        return {
            scoreLabel,
            scoreValue,
            transitionEffect,
            transitionDuration: Number(transitionDuration),
            fontFamily,
            fontSize: Number(fontSize),
            messagePresets,
            activePresetName,
            burndown: {
                label: burndownLabel,
                targetValue: Number(burndownTargetValue),
                entries: burndownEntries,
            }
        };
    };

    const handleTriggerEffect = async (effectName: string) => {
        if (effectStatus === 'loading') return; // Prevent spamming
        setEffectStatus('loading');
        try {
            const payload = {
                ...getPayload(),
                lastEvent: {name: effectName, timestamp: Date.now()},
            };
            const res = await axios.post('/api/stream-data', payload);
            if (res.status === 200) setEffectStatus('success');
            else setEffectStatus('error');
        } catch (error) {
            setEffectStatus('error');
        } finally {
            setTimeout(() => setEffectStatus('idle'), 2000);
        }
    };

    const handleSubmit = async () => {
        setStatus('loading');
        try {
            const payload = {
                ...getPayload(),
                lastEvent: null,
            };
            const res = await axios.post('/api/stream-data', payload);
            if (res.status === 200) setStatus('success');
            else setStatus('error');
        } catch (error) {
            setStatus('error');
        } finally {
            setTimeout(() => setStatus('idle'), 3000);
        }
    };

    const handleToggleListening = () => {
        if (isListening) {
            recognitionRef.current?.stop();
        } else {
            recognitionRef.current?.start();
        }
        setIsListening(!isListening);
    };

    const handleVoiceCommand = (text: string) => {
        if (text.includes('ナイス')) {
            handleTriggerEffect('STAR');
        } else if (text.includes('ありがとう')) {
            handleTriggerEffect('LOVE');
        } else if (text.includes('よっしゃ')) {
            handleTriggerEffect('SPARKLE');
        } else if (text.includes('やべぇ') || text.includes('やばい')) {
            handleTriggerEffect('BUBBLE');
        }
    };

    return (
        <ThemeProvider theme={darkTheme}>
            <Box sx={{minHeight: '100vh', bgcolor: 'background.default', color: 'text.primary', position: 'relative', overflow: 'hidden'}}>
                <Box sx={{position: 'absolute', top: '-200px', left: '-200px', width: '500px', height: '500px', bgcolor: 'primary.main', borderRadius: '50%', filter: 'blur(150px)', opacity: 0.3}}/>
                <Box sx={{position: 'absolute', bottom: '-250px', right: '-250px', width: '600px', height: '600px', bgcolor: 'secondary.main', borderRadius: '50%', filter: 'blur(150px)', opacity: 0.3}}/>
                
                <Box sx={{p: 4, maxWidth: 700, margin: 'auto', position: 'relative', zIndex: 1, pb: '120px'}}>
                    <Box sx={{display: 'flex', alignItems: 'center', gap: 2, mb: 2}}>
                        <Image src="/favicon.svg" alt="icon" width={40} height={40}/>
                        <Typography variant="h4" component="h1" gutterBottom sx={{mb: 0, color: 'text.primary'}}>
                            配信オーバーレイ設定パネル
                        </Typography>
                    </Box>

                    <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)} centered sx={{mb: 3}}>
                        <Tab label="スコア表示" value="score"/>
                        <Tab label="バーンダウン" value="burndown"/>
                        <Tab label="メッセージ" value="message"/>
                        <Tab label="共通設定" value="common"/>
                    </Tabs>

                    {activeTab === 'score' && (
                        <Paper elevation={12} sx={{p: 3, bgcolor: 'background.paper', backdropFilter: 'blur(10px)', border: '1px solid rgba(255, 255, 255, 0.1)'}}>
                            <Typography variant="h6" gutterBottom>スコア設定</Typography>
                            <TextField label="フィールド名" value={scoreLabel} onChange={(e) => setScoreLabel(e.target.value)} fullWidth margin="normal" variant="outlined" multiline rows={2}/>
                            <TextField label="値" value={scoreValue} onChange={(e) => setScoreValue(e.target.value)} fullWidth margin="normal" variant="outlined"/>
                        </Paper>
                    )}

                    {activeTab === 'burndown' && (
                        <Paper elevation={12} sx={{p: 3, bgcolor: 'background.paper', backdropFilter: 'blur(10px)', border: '1px solid rgba(255, 255, 255, 0.1)'}}>
                            <Typography variant="h6" gutterBottom>バーンダウンチャート設定</Typography>
                            <TextField label="フィールド名" value={burndownLabel} onChange={(e) => setBurndownLabel(e.target.value)} fullWidth margin="normal" variant="outlined" multiline rows={2} />
                            <TextField label="目標値" type="number" value={burndownTargetValue} onChange={(e) => setBurndownTargetValue(Number(e.target.value))} fullWidth margin="normal" variant="outlined" />
                            <TextField label="獲得ポイント履歴 (1行に1つ)" multiline rows={10} value={burndownEntriesText} onChange={(e) => setBurndownEntriesText(e.target.value)} fullWidth margin="normal" variant="outlined" helperText="試合で獲得したポイントを改行区切りで入力します。" />
                        </Paper>
                    )}

                    {activeTab === 'message' && (
                        <Paper elevation={12} sx={{p: 3, bgcolor: 'background.paper', backdropFilter: 'blur(10px)', border: '1px solid rgba(255, 255, 255, 0.1)'}}>
                            <Typography variant="h6" gutterBottom>視聴者向け概要メッセージ</Typography>
                            <Box sx={{borderBottom: 1, borderColor: 'divider', mb: 2}}>
                                <Tabs value={activePresetName} onChange={(e, newValue) => setActivePresetName(newValue)} variant="scrollable" scrollButtons="auto" aria-label="メッセージプリセット">
                                    {messagePresets.map(preset => (<Tab key={preset.name} label={preset.name} value={preset.name}/>))}
                                </Tabs>
                            </Box>
                            <Box sx={{my: 2, maxHeight: 150, overflowY: 'auto', p: 1, bgcolor: 'rgba(255, 255, 255, 0.03)', borderRadius: '4px'}}>
                                {messagePresets.find(p => p.name === activePresetName)?.messages.length === 0 ? (
                                    <Typography variant="body2" color="text.secondary" sx={{p: 1}}>メッセージがありません</Typography>
                                ) : (
                                    messagePresets.find(p => p.name === activePresetName)?.messages.map((msg) => (
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
                                <Select value={transitionEffect} label="切り替えエフェクト" onChange={(e) => setTransitionEffect(e.target.value)}>
                                    <MenuItem value={'fade'}>フェード</MenuItem>
                                    <MenuItem value={'slide'}>スライド</MenuItem>
                                </Select>
                            </FormControl>
                            <TextField label="表示秒数 (秒)" type="number" value={transitionDuration} onChange={(e) => setTransitionDuration(Number(e.target.value))} fullWidth margin="normal" inputProps={{min: 1}} variant="outlined"/>
                        </Paper>
                    )}

                    {activeTab === 'common' && (
                        <>
                             <Paper elevation={12} sx={{ mb: 3, p: 3, bgcolor: 'background.paper', backdropFilter: 'blur(10px)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                                <Typography variant="h6" gutterBottom>📣 音声認識エフェクト</Typography>
                                <Box sx={{display: 'flex', alignItems: 'center', gap: 2}}>
                                    <Button variant="contained" color={isListening ? 'error' : 'secondary'} onClick={handleToggleListening}>
                                        {isListening ? '音声認識を停止' : '音声認識を開始'}
                                    </Button>
                                    {isListening && <Chip label="音声認識中..." color="secondary" />}
                                </Box>
                                <Typography variant="body2" sx={{mt: 2, color: 'text.secondary'}}>
                                    最終認識テキスト: {transcript || '...'}
                                </Typography>
                                <Typography variant="caption" display="block" sx={{mt: 1, color: 'text.secondary'}}>
                                    「ナイス」→ ⭐, 「ありがとう」→ 💖, 「よっしゃ」→ ✨, 「やべぇ」→ 🫧
                                </Typography>
                            </Paper>
                            <Paper elevation={12} sx={{ mb: 3, p: 3, bgcolor: 'background.paper', backdropFilter: 'blur(10px)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                                <Typography variant="h6" gutterBottom>🎨 フォント設定</Typography>
                                <TextField label="フォント名 (CSS font-family)" value={fontFamily} onChange={(e) => setFontFamily(e.target.value)} fullWidth margin="normal" helperText="システムフォントや、OBS側でカスタムフォントがインストールされているフォント名を入力" variant="outlined"/>
                                <TextField label="フォントサイズ (px)" type="number" value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} fullWidth margin="normal" inputProps={{min: 1}} variant="outlined"/>
                            </Paper>
                            <Paper elevation={12} sx={{p: 3, bgcolor: 'background.paper', backdropFilter: 'blur(10px)', border: '1px solid rgba(255, 255, 255, 0.1)'}}>
                                <Typography variant="h6" gutterBottom>演出効果</Typography>
                                <Box sx={{display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap'}}>
                                    <Button variant="contained" color="primary" onClick={() => handleTriggerEffect('LOVE')} disabled={effectStatus === 'loading'}>💖 LOVE</Button>
                                    <Button variant="contained" color="secondary" onClick={() => handleTriggerEffect('STAR')} disabled={effectStatus === 'loading'}>⭐ STAR</Button>
                                    <Button variant="contained" color="secondary" onClick={() => handleTriggerEffect('SPARKLE')} disabled={effectStatus === 'loading'}>✨ SPARKLE</Button>
                                    <Button variant="contained" color="secondary" onClick={() => handleTriggerEffect('BUBBLE')} disabled={effectStatus === 'loading'}>🫧 BUBBLE</Button>
                                    {effectStatus === 'success' && (<Typography color="success.main" variant="body2">送信完了</Typography>)}
                                    {effectStatus === 'error' && (<Typography color="error.main" variant="body2">送信失敗</Typography>)}
                                </Box>
                            </Paper>
                        </>
                    )}

                    <Box sx={{ mt: 4, p: 2, border: '1px dashed grey', borderRadius: '4px', bgcolor: 'rgba(255, 255, 255, 0.05)' }}>
                        <Typography variant="body2" fontWeight="bold">OBSブラウザソース設定</Typography>
                        <Typography variant="body2">スコア表示URL: <code style={{ backgroundColor: '#333', padding: '2px 4px', borderRadius: '4px', color: 'text.primary' }}>{origin}/obs-overlay</code></Typography>
                        <Typography variant="body2">バーンダウン表示URL: <code style={{ backgroundColor: '#333', padding: '2px 4px', borderRadius: '4px', color: 'text.primary' }}>{origin}/burndown-overlay</code></Typography>
                        <Typography variant="body2">幅: 1450, 高さ: 160 (スコア表示)</Typography>
                        <Typography variant="body2">幅: 250, 高さ: 584 (バーンダウン表示)</Typography>
                    </Box>
                </Box>
                
                <Paper elevation={16} sx={{ position: 'fixed', bottom: 0, left: 0, right: 0, p: 2, zIndex: 10, bgcolor: 'rgba(18, 18, 18, 0.9)', backdropFilter: 'blur(10px)', borderTop: '1px solid rgba(255, 255, 255, 0.1)'}}>
                    <Box sx={{ maxWidth: 700, margin: 'auto' }}>
                        <Button variant="contained" color="primary" onClick={handleSubmit} disabled={status === 'loading'} fullWidth size="large" sx={{ p: 1.5, fontSize: '1rem' }}>
                            {status === 'loading' ? '更新中...' : 'OBSに反映 (データ送信)'}
                        </Button>
                        {status === 'success' && (<Typography color="success.main" align="center" sx={{mt: 1}}>✅ データを更新しました！OBS画面に反映されます。</Typography>)}
                        {status === 'error' && (<Typography color="error.main" align="center" sx={{mt: 1}}>❌ 更新に失敗しました。サーバー/APIを確認してください。</Typography>)}
                    </Box>
                </Paper>
            </Box>
        </ThemeProvider>
    );
};

export default ControlPanelPage;