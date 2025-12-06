'use client';

import React, {useState, useEffect} from 'react';
import axios from 'axios'; // axiosをインポート
import {StreamData, MessagePreset} from '../api/stream-data/route';
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
} from '@mui/material';
import RemoveCircleIcon from '@mui/icons-material/RemoveCircle';

interface MessageItem {
    id: number;
    text: string;
}

const ControlPanelPage: React.FC = () => {
    // ... (state declarations are the same)
    const [scoreLabel, setScoreLabel] = useState<string>('');
    const [scoreValue, setScoreValue] = useState<number>(0);
    const [currentMessage, setCurrentMessage] = useState<string>('');
    const [transitionEffect, setTransitionEffect] = useState<string>('fade');
    const [transitionDuration, setTransitionDuration] = useState<number>(2);
    const [fontFamily, setFontFamily] = useState<string>('');
    const [fontSize, setFontSize] = useState<number>(54);
    
    // 新しいState
    const [messagePresets, setMessagePresets] = useState<MessagePreset[]>([]);
    const [activePresetName, setActivePresetName] = useState<string>('');

    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [origin, setOrigin] = useState<string>('');

        // 初期データをAPIから取得

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

                        // プリセットとアクティブなプリセット名を設定

                        setMessagePresets(initialData.messagePresets);

                        setActivePresetName(initialData.activePresetName);

                    }

                } catch (e) {

                    console.error("Failed to fetch initial data", e);

                }

            };

            fetchInitialData();

        }, []);

    

        // アクティブなプリセットのメッセージリストを更新する

        const updateActiveMessages = (updatedMessages: MessageItem[]) => {

            const updatedPresets = messagePresets.map(preset =>

                preset.name === activePresetName

                    ? { ...preset, messages: updatedMessages }

                    : preset

            );

            setMessagePresets(updatedPresets);

        };

        

        const handleAddMessage = () => {

            if (currentMessage.trim() !== '') {

                const activePreset = messagePresets.find(p => p.name === activePresetName);

                if (!activePreset) return;

    

                const updatedMessages = [...activePreset.messages, { id: Date.now(), text: currentMessage.trim() }];

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

    

        // データ更新の処理

        const handleSubmit = async () => {

            setStatus('loading');

            try {

                const payload = {

                    scoreLabel,

                    scoreValue: Number(scoreValue),

                    transitionEffect,

                    transitionDuration: Number(transitionDuration),

                    fontFamily,

                    fontSize: Number(fontSize),

                    messagePresets, // すべてのプリセットを送信

                    activePresetName, // アクティブなプリセット名を送信

                };

                const res = await axios.post('/api/stream-data', payload);

    

                if (res.status === 200) {

                    setStatus('success');

                } else {

                    setStatus('error');

                }

                // eslint-disable-next-line @typescript-eslint/no-unused-vars

            } catch (error) {

                setStatus('error');

            } finally {

                setTimeout(() => setStatus('idle'), 3000);

            }

        };

    return (
        <Box sx={{p: 4, maxWidth: 700, margin: 'auto'}}>
            <Typography variant="h4" component="h1" gutterBottom>
                🎮 配信オーバーレイ設定パネル
            </Typography>

            <Paper elevation={3} sx={{p: 3, mb: 3}}>
                {/* ... (スコア設定UI) ... */}
                <Typography variant="h6" gutterBottom>スコア設定</Typography>
                <TextField label="フィールド名" value={scoreLabel} onChange={(e) => setScoreLabel(e.target.value)}
                           fullWidth margin="normal"/>
                <TextField label="値" type="number" value={scoreValue}
                           onChange={(e) => setScoreValue(Number(e.target.value))} fullWidth margin="normal"/>
            </Paper>

            {/* --- フォント設定 --- */}
            <Paper elevation={3} sx={{p: 3, mb: 3}}>
                <Typography variant="h6" gutterBottom>
                    🎨 フォント設定 (CSS Font Family)
                </Typography>
                <TextField
                    label="フォント名 (例: 'Noto Sans JP', sans-serif)"
                    value={fontFamily}
                    onChange={(e) => setFontFamily(e.target.value)}
                    fullWidth
                    margin="normal"
                    helperText="システムフォントや、OBS側でカスタムフォントがインストールされているフォント名を入力してください。"
                />
                <TextField
                    label="フォントサイズ (px)"
                    type="number"
                    value={fontSize}
                    onChange={(e) => setFontSize(Number(e.target.value))}
                    fullWidth
                    margin="normal"
                    inputProps={{ min: 1 }}
                />
            </Paper>

            <Paper elevation={3} sx={{p: 3, mb: 3}}>
                <Typography variant="h6" gutterBottom>視聴者向け概要メッセージ</Typography>

                <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
                    <Tabs
                        value={activePresetName}
                        onChange={(e, newValue) => setActivePresetName(newValue)}
                        variant="scrollable"
                        scrollButtons="auto"
                        aria-label="メッセージプリセット"
                    >
                        {messagePresets.map(preset => (
                            <Tab key={preset.name} label={preset.name} value={preset.name} />
                        ))}
                    </Tabs>
                </Box>

                {/* 現在アクティブなプリセットのメッセージリストを表示 */}
                <Box sx={{
                    my: 2,
                    maxHeight: 150,
                    overflowY: 'auto',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    p: 1
                }}>
                    {messagePresets.find(p => p.name === activePresetName)?.messages.length === 0 ? (
                        <Typography variant="body2" color="textSecondary" sx={{p: 1}}>メッセージがありません</Typography>
                    ) : (
                        messagePresets.find(p => p.name === activePresetName)?.messages.map((msg) => (
                            <Box key={msg.id} sx={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                p: 0.5,
                                borderBottom: '1px dotted #eee'
                            }}>
                                <Typography variant="body1" sx={{
                                    flexGrow: 1,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap'
                                }}>{msg.text}</Typography>
                                <IconButton size="small" color="error"
                                            onClick={() => handleRemoveMessage(msg.id)}><RemoveCircleIcon
                                    fontSize="small"/></IconButton>
                            </Box>
                        ))
                    )}
                </Box>
                <Box sx={{display: 'flex', gap: 1, alignItems: 'center', mb: 2}}>
                    <TextField label="新しいメッセージ" value={currentMessage}
                               onChange={(e) => setCurrentMessage(e.target.value)} fullWidth/>
                    <Button variant="contained" onClick={handleAddMessage} disabled={currentMessage.trim() === ''}
                            sx={{minWidth: '100px'}}>追加</Button>
                </Box>

                <FormControl fullWidth margin="normal">
                    <InputLabel>切り替えエフェクト</InputLabel>
                    <Select value={transitionEffect} label="切り替えエフェクト"
                            onChange={(e) => setTransitionEffect(e.target.value)}>
                        <MenuItem value={'fade'}>フェード</MenuItem>
                        <MenuItem value={'slide'}>スライド</MenuItem>
                    </Select>
                </FormControl>

                <TextField label="表示秒数 (秒)" type="number" value={transitionDuration}
                           onChange={(e) => setTransitionDuration(Number(e.target.value))} fullWidth margin="normal"
                           inputProps={{min: 1}}/>
            </Paper>

            <Button
                variant="contained"
                color="primary"
                onClick={handleSubmit}
                disabled={status === 'loading'}
                fullWidth
                size="large"
            >
                {status === 'loading' ? '更新中...' : 'OBSに反映 (データ送信)'}
            </Button>

            {status === 'success' && (<Typography color="primary" align="center" sx={{mt: 2}}>✅
                データを更新しました！OBS画面に反映されます。</Typography>)}
            {status === 'error' && (<Typography color="error" align="center" sx={{mt: 2}}>❌
                更新に失敗しました。サーバー/APIを確認してください。</Typography>)}

            <Box sx={{mt: 4, p: 2, border: '1px dashed #ccc', bgcolor: '#f9f9f9', borderRadius: '4px'}}>
                <Typography variant="body2" fontWeight="bold">OBSブラウザソース設定</Typography>
                <Typography variant="body2">URL: <code style={{
                    backgroundColor: '#eee',
                    padding: '2px 4px',
                    borderRadius: '4px'
                }}>{origin}/obs-overlay</code></Typography>
                <Typography variant="body2">幅: 1450, 高さ: 140</Typography>
            </Box>
        </Box>
    );
};

export default ControlPanelPage;