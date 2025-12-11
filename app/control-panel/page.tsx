'use client';

import RemoveCircleIcon from '@mui/icons-material/RemoveCircle';
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
    Alert,
    AlertTitle,
} from '@mui/material';
import {createTheme, ThemeProvider} from '@mui/material/styles';
import axios from 'axios';
import Image from 'next/image';
import React, {useState, useEffect, useRef, useMemo, useCallback} from 'react';

import {getItem, setItem, removeItem} from '../../lib/localStorage';
import {StreamData, MessagePreset} from '../api/stream-data/route';


// --- Speech API Type Definitions ---
interface SpeechRecognitionEvent {
    resultIndex: number;
    results: {
        isFinal: boolean;
        [key: number]: {
            transcript: string;
        };
    }[];
}

interface SpeechRecognitionErrorEvent {
    error: string;
}

interface SpeechRecognition extends EventTarget {
    continuous: boolean;
    lang: string;
    interimResults: boolean;
    onstart: () => void;
    onresult: (event: SpeechRecognitionEvent) => void;
    onerror: (event: SpeechRecognitionErrorEvent) => void;
    onend: () => void;
    start: () => void;
    stop: () => void;
}

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
                    },
                },
            },
        },
    },
});

const LOCAL_STORAGE_KEY = 'control-panel-state';

interface FormData {
    scoreLabel: string;
    scoreValue: string;
    burndownLabel: string;
    burndownTargetValue: number;
    burndownEntriesText: string;
    fontFamily: string;
    fontSize: number;
    transitionEffect: string;
    transitionDuration: number;
    messagePresets: MessagePreset[];
    activePresetName: string;
}


const ControlPanelPage: React.FC = () => {
    // General state
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [effectStatus, setEffectStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [origin, setOrigin] = useState<string>('');
    const [activeTab, setActiveTab] = useState('score');
    const [isInitialized, setIsInitialized] = useState(false);
    const [storageError, setStorageError] = useState(false);

    // All form data in a single state object
    const [formData, setFormData] = useState<FormData | null>(null);

    // Voice recognition state
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [interimTranscript, setInterimTranscript] = useState('');
    const [recognitionError, setRecognitionError] = useState('');
    const recognitionRef = useRef<SpeechRecognition | null>(null);

    // Message scroller temporary state
    const [currentMessage, setCurrentMessage] = useState<string>('');

    // Helper to parse burndown entries and calculate total
    const {parsedEntries, totalEntries} = useMemo(() => {
        const text = formData?.burndownEntriesText || '';
        const entries = text.split('\n')
            .map(line => Number(line.trim()))
            .filter(n => !isNaN(n) && n > 0);
        const total = entries.reduce((sum, current) => sum + current, 0);
        return {parsedEntries: entries, totalEntries: total};
    }, [formData?.burndownEntriesText]);
    
    const getPayload = useCallback(() => {
        if (!formData) return {};
        const burndownEntries = parsedEntries;
        return {
            scoreLabel: formData.scoreLabel,
            scoreValue: formData.scoreValue,
            transitionEffect: formData.transitionEffect,
            transitionDuration: Number(formData.transitionDuration),
            fontFamily: formData.fontFamily,
            fontSize: Number(formData.fontSize),
            messagePresets: formData.messagePresets,
            activePresetName: formData.activePresetName,
            burndown: {
                label: formData.burndownLabel,
                targetValue: Number(formData.burndownTargetValue),
                entries: burndownEntries,
            }
        };
    }, [formData, parsedEntries]);

    const handleTriggerEffect = useCallback(async (effectName: string) => {
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
        } catch {
            setEffectStatus('error');
        } finally {
            setTimeout(() => setEffectStatus('idle'), 2000);
        }
    }, [effectStatus, getPayload]);
    
    // --- Effects ---
    // Initialization Effect
    useEffect(() => {
        if (typeof window !== 'undefined') {
            setOrigin(window.location.origin);

            try {
                const savedState = getItem<FormData>(LOCAL_STORAGE_KEY);
                if (savedState) {
                    setFormData(savedState);
                } else {
                    // Fetch from API only if no local data exists
                    axios.get<StreamData>('/api/stream-data').then(res => {
                        if (res.status === 200) {
                            const apiData = res.data;
                            setFormData({
                                scoreLabel: apiData.scoreLabel,
                                scoreValue: apiData.scoreValue,
                                transitionEffect: apiData.transitionEffect,
                                transitionDuration: apiData.transitionDuration,
                                fontFamily: apiData.fontFamily,
                                fontSize: apiData.fontSize,
                                messagePresets: apiData.messagePresets,
                                activePresetName: apiData.activePresetName,
                                burndownLabel: apiData.burndown.label,
                                burndownTargetValue: apiData.burndown.targetValue,
                                burndownEntriesText: apiData.burndown.entries.join('\n'),
                            });
                        }
                    }).catch(e => console.error("Failed to fetch initial data", e));
                }
            } catch (error) {
                console.error("Failed to load or parse state from localStorage", error);
                setStorageError(true);
            } finally {
                setIsInitialized(true);
            }
        }
    }, []);

    // State Persistence Effect
    useEffect(() => {
        if (isInitialized && formData && !storageError) {
            setItem(LOCAL_STORAGE_KEY, formData);
        }
    }, [formData, isInitialized, storageError]);

    // Speech Recognition Effect
     const handleVoiceCommand = useCallback(async (text: string) => {
        const trigger = (effect: string) => handleTriggerEffect(effect);
        if (text.includes('ナイス')) await trigger('STAR');
        else if (text.includes('ありがとう')) await trigger('LOVE');
        else if (text.includes('よっしゃ')) await trigger('SPARKLE');
        else if (text.includes('やべぇ') || text.includes('やばい')) await trigger('BUBBLE');
    }, [handleTriggerEffect]);
    
    useEffect(() => {
        // @ts-expect-error: SpeechRecognition is a browser-specific API
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.warn("Speech Recognition API is not supported in this browser.");
            setRecognitionError("音声認識はこのブラウザではサポートされていません。");
            return;
        }

        const recognition: SpeechRecognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.lang = 'ja-JP';
        recognition.interimResults = true; // Enable interim results

        recognition.onstart = () => {
            console.log('Speech recognition started.');
            setRecognitionError('');
        };

        recognition.onresult = (event: SpeechRecognitionEvent) => {
            let currentInterimTranscript = '';
            let finalTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcriptPart = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcriptPart;
                } else {
                    currentInterimTranscript += transcriptPart;
                }
            }
            setInterimTranscript(currentInterimTranscript);
            if (finalTranscript) {
                setTranscript(finalTranscript.trim());
                handleVoiceCommand(finalTranscript.trim());
            }
        };

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
            console.error('Speech recognition error:', event.error);
            setRecognitionError(`エラー: ${event.error}`);
        };
        
        recognition.onend = () => {
            console.log('Speech recognition ended.');
            if (isListening) {
                recognition.start(); // Restart if it was intended to be listening
            }
        };

        recognitionRef.current = recognition;

        return () => {
            recognition.stop();
        };
    }, [isListening, handleVoiceCommand]);

    // --- Handlers ---
    const updateFormData = (delta: Partial<FormData>) => {
        setFormData(prev => prev ? {...prev, ...delta} : null);
    };

    const handleAddMessage = () => {
        if (currentMessage.trim() !== '' && formData) {
            const activePreset = formData.messagePresets.find(p => p.name === formData.activePresetName);
            if (!activePreset) return;
            const updatedMessages = [...activePreset.messages, {id: Date.now(), text: currentMessage.trim()}];
            const updatedPresets = formData.messagePresets.map(preset =>
                preset.name === formData.activePresetName ? {...preset, messages: updatedMessages} : preset
            );
            updateFormData({messagePresets: updatedPresets});
            setCurrentMessage('');
        }
    };

    const handleRemoveMessage = (id: number) => {
        if (!formData) return;
        const activePreset = formData.messagePresets.find(p => p.name === formData.activePresetName);
        if (!activePreset) return;
        const updatedMessages = activePreset.messages.filter(msg => msg.id !== id);
        const updatedPresets = formData.messagePresets.map(preset =>
            preset.name === formData.activePresetName ? {...preset, messages: updatedMessages} : preset
        );
        updateFormData({messagePresets: updatedPresets});
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
        } catch {
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
    
    const handleClearCache = () => {
        removeItem(LOCAL_STORAGE_KEY);
        window.location.reload();
    };

    if (!isInitialized || !formData) {
        return (
             <ThemeProvider theme={darkTheme}>
                 <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', color: 'text.primary', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    {storageError ? (
                        <Alert severity="error" action={
                            <Button color="inherit" size="small" onClick={handleClearCache}>
                                キャッシュをクリア
                            </Button>
                        }>
                            <AlertTitle>エラー</AlertTitle>
                            設定の読み込みに失敗しました。ローカルストレージのデータが破損している可能性があります。
                            キャッシュをクリアしてリロードしてください。
                        </Alert>
                    ) : (
                        <Typography>読み込み中...</Typography>
                    )}
                </Box>
            </ThemeProvider>
        );
    }
    
    return (
        <ThemeProvider theme={darkTheme}>
            <Box sx={{minHeight: '100vh', bgcolor: 'background.default', color: 'text.primary', position: 'relative', overflow: 'hidden'}}>
                <Box sx={{position: 'absolute', top: '-200px', left: '-200px', width: '500px', height: '500px', bgcolor: 'primary.main', borderRadius: '50%', filter: 'blur(150px)', opacity: 0.3}}/>
                <Box sx={{position: 'absolute', bottom: '-250px', right: '-250px', width: '600px', height: '600px', bgcolor: 'secondary.main', borderRadius: '50%', filter: 'blur(150px)', opacity: 0.3}}/>

                <Box sx={{p: 4, maxWidth: 700, margin: 'auto', position: 'relative', zIndex: 1, pb: '120px'}}>
                    {storageError && (
                        <Alert severity="error" sx={{mb: 2}} action={
                            <Button color="inherit" size="small" onClick={handleClearCache}>
                                キャッシュをクリア
                            </Button>
                        }>
                            <AlertTitle>エラー</AlertTitle>
                            設定の読み込みに失敗しました。データが破損している可能性があります。キャッシュをクリアしてください。
                        </Alert>
                    )}
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
                            <TextField label="フィールド名" value={formData.scoreLabel} onChange={(e) => updateFormData({scoreLabel: e.target.value})} fullWidth margin="normal" variant="outlined" multiline rows={2}/>
                            <TextField label="値" value={formData.scoreValue} onChange={(e) => updateFormData({scoreValue: e.target.value})} fullWidth margin="normal" variant="outlined"/>
                        </Paper>
                    )}

                    {activeTab === 'burndown' && (
                        <Paper elevation={12} sx={{p: 3, bgcolor: 'background.paper', backdropFilter: 'blur(10px)', border: '1px solid rgba(255, 255, 255, 0.1)'}}>
                            <Typography variant="h6" gutterBottom>バーンダウンチャート設定</Typography>
                            <TextField label="フィールド名" value={formData.burndownLabel} onChange={(e) => updateFormData({burndownLabel: e.target.value})} fullWidth margin="normal" variant="outlined" multiline rows={2}/>
                            <TextField label="目標値" type="number" value={formData.burndownTargetValue} onChange={(e) => updateFormData({burndownTargetValue: Number(e.target.value)})} fullWidth margin="normal" variant="outlined"/>
                            <TextField label="獲得ポイント履歴 (1行に1つ)" multiline rows={10} value={formData.burndownEntriesText} onChange={(e) => updateFormData({burndownEntriesText: e.target.value})} fullWidth margin="normal" variant="outlined" helperText="試合で獲得したポイントを改行区切りで入力します。"/>
                            
                            <Box sx={{mt: 2, display: 'flex', gap: 2}}>
                                <Box sx={{flex: 1, maxHeight: 200, overflowY: 'auto', p: 1, bgcolor: 'rgba(255, 255, 255, 0.03)', borderRadius: '4px'}}>
                                    <Typography variant="body2" color="text.secondary" gutterBottom>入力値の詳細:</Typography>
                                    {parsedEntries.map((value, index) => (
                                        <Typography key={index} variant="body2">
                                            {index + 1}: {value}
                                        </Typography>
                                    ))}
                                </Box>
                                <Box sx={{flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', bgcolor: 'rgba(255, 255, 255, 0.03)', borderRadius: '4px', p: 1}}>
                                    <Typography variant="h6" color="primary">合計</Typography>
                                    <Typography variant="h4" color="text.primary" fontWeight="bold">
                                        {totalEntries.toLocaleString()}
                                    </Typography>
                                </Box>
                            </Box>
                        </Paper>
                    )}

                    {activeTab === 'message' && (
                        <Paper elevation={12} sx={{p: 3, bgcolor: 'background.paper', backdropFilter: 'blur(10px)', border: '1px solid rgba(255, 255, 255, 0.1)'}}>
                            <Typography variant="h6" gutterBottom>視聴者向け概要メッセージ</Typography>
                            <Box sx={{borderBottom: 1, borderColor: 'divider', mb: 2}}>
                                <Tabs value={formData.activePresetName} onChange={(e, newValue) => updateFormData({activePresetName: newValue})} variant="scrollable" scrollButtons="auto" aria-label="メッセージプリセット">
                                    {formData.messagePresets.map(preset => (<Tab key={preset.name} label={preset.name} value={preset.name}/>))}
                                </Tabs>
                            </Box>
                            <Box sx={{my: 2, maxHeight: 150, overflowY: 'auto', p: 1, bgcolor: 'rgba(255, 255, 255, 0.03)', borderRadius: '4px'}}>
                                {formData.messagePresets.find(p => p.name === formData.activePresetName)?.messages.length === 0 ? (
                                    <Typography variant="body2" color="text.secondary" sx={{p: 1}}>メッセージがありません</Typography>
                                ) : (
                                    formData.messagePresets.find(p => p.name === formData.activePresetName)?.messages.map((msg) => (
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
                                <Select value={formData.transitionEffect} label="切り替えエフェクト" onChange={(e) => updateFormData({transitionEffect: e.target.value})}>
                                    <MenuItem value={'fade'}>フェード</MenuItem>
                                    <MenuItem value={'slide'}>スライド</MenuItem>
                                </Select>
                            </FormControl>
                            <TextField label="表示秒数 (秒)" type="number" value={formData.transitionDuration} onChange={(e) => updateFormData({transitionDuration: Number(e.target.value)})} fullWidth margin="normal" inputProps={{min: 1}} variant="outlined"/>
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
                                    認識中: {interimTranscript || '...'}
                                </Typography>
                                <Typography variant="body2" sx={{mt: 1, color: 'text.secondary'}}>
                                    最終認識テキスト: {transcript || '...'}
                                </Typography>
                                <Typography variant="caption" display="block" sx={{mt: 1, color: 'text.secondary'}}>
                                    「ナイス」→ ⭐, 「ありがとう」→ 💖, 「よっしゃ」→ ✨, 「やべぇ」→ 🫧
                                </Typography>
                                {recognitionError && <Typography variant="body2" color="error" sx={{mt: 1}}>音声認識エラー: {recognitionError}</Typography>}
                            </Paper>
                            <Paper elevation={12} sx={{ mb: 3, p: 3, bgcolor: 'background.paper', backdropFilter: 'blur(10px)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                                <Typography variant="h6" gutterBottom>🎨 フォント設定</Typography>
                                <TextField label="フォント名 (CSS font-family)" value={formData.fontFamily} onChange={(e) => updateFormData({fontFamily: e.target.value})} fullWidth margin="normal" helperText="システムフォントや、OBS側でカスタムフォントがインストールされているフォント名を入力" variant="outlined"/>
                                <TextField label="フォントサイズ (px)" type="number" value={formData.fontSize} onChange={(e) => updateFormData({fontSize: Number(e.target.value)})} fullWidth margin="normal" inputProps={{min: 1}} variant="outlined"/>
                            </Paper>
                            <Paper elevation={12} sx={{p: 3, bgcolor: 'background.paper', backdropFilter: 'blur(10px)', border: '1px solid rgba(255, 255, 255, 0.1)'}}>
                                <Typography variant="h6" gutterBottom>各種設定</Typography>
                                <Box sx={{display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap'}}>
                                     <Button variant="outlined" color="warning" onClick={handleClearCache}>
                                        入力キャッシュをクリア
                                    </Button>
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