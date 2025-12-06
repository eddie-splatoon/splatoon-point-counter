import React, { useState, useEffect } from 'react';
import { StreamData } from './api/stream-data'; // APIの型定義を利用
import { TextField, Button, Select, MenuItem, InputLabel, FormControl, Box, Paper, Typography } from '@mui/material';

// メッセージアイテムの型
interface MessageItem {
    id: number;
    text: string;
}

const ControlPanel: React.FC = () => {
    const [scoreLabel, setScoreLabel] = useState<string>('');
    const [scoreValue, setScoreValue] = useState<number>(0);
    const [messages, setMessages] = useState<MessageItem[]>([]);
    const [currentMessage, setCurrentMessage] = useState<string>('');
    const [transitionEffect, setTransitionEffect] = useState<string>('fade');
    const [transitionDuration, setTransitionDuration] = useState<number>(5);
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

    // 初期データをAPIから取得
    useEffect(() => {
        const fetchInitialData = async () => {
            const res = await fetch('/api/stream-data');
            if (res.ok) {
                const initialData: StreamData = await res.json();
                setScoreLabel(initialData.scoreLabel);
                setScoreValue(initialData.scoreValue);
                setMessages(initialData.messages);
                setTransitionEffect(initialData.transitionEffect);
                setTransitionDuration(initialData.transitionDuration);
            }
        };
        fetchInitialData();
    }, []);

    // メッセージの追加
    const handleAddMessage = () => {
        if (currentMessage.trim() !== '') {
            setMessages([...messages, { id: Date.now(), text: currentMessage.trim() }]);
            setCurrentMessage('');
        }
    };

    // メッセージの削除
    const handleRemoveMessage = (id: number) => {
        setMessages(messages.filter(msg => msg.id !== id));
    };

    // データ更新の処理
    const handleSubmit = async () => {
        setStatus('loading');
        try {
            const res = await fetch('/api/stream-data', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    scoreLabel: scoreLabel,
                    scoreValue: Number(scoreValue),
                    messages: messages,
                    transitionEffect: transitionEffect,
                    transitionDuration: Number(transitionDuration),
                }),
            });

            if (res.ok) {
                setStatus('success');
            } else {
                setStatus('error');
            }
        } catch (error) {
            console.error('Update failed:', error);
            setStatus('error');
        } finally {
            setTimeout(() => setStatus('idle'), 2000);
        }
    };

    return (
        <Box sx={{ p: 4, maxWidth: 600, margin: 'auto' }}>
            <Typography variant="h4" component="h1" gutterBottom>
                🚀 配信オーバーレイ設定パネル
            </Typography>

            <Paper elevation={3} sx={{ p: 3, mb: 3 }}>
                <Typography variant="h6" gutterBottom>
                    スコア設定
                </Typography>
                <TextField
                    label="フィールド名"
                    value={scoreLabel}
                    onChange={(e) => setScoreLabel(e.target.value)}
                    fullWidth
                    margin="normal"
                />
                <TextField
                    label="値"
                    type="number"
                    value={scoreValue}
                    onChange={(e) => setScoreValue(Number(e.target.value))}
                    fullWidth
                    margin="normal"
                />
            </Paper>

            <Paper elevation={3} sx={{ p: 3, mb: 3 }}>
                <Typography variant="h6" gutterBottom>
                    視聴者向け概要メッセージ
                </Typography>

                {/* メッセージリスト */}
                <Box sx={{ my: 2, maxHeight: 150, overflowY: 'auto', border: '1px solid #ccc', p: 1 }}>
                    {messages.map((msg) => (
                        <Box key={msg.id} sx={{ display: 'flex', justifyContent: 'space-between', p: 0.5, borderBottom: '1px dotted #eee' }}>
                            <Typography variant="body2">{msg.text}</Typography>
                            <Button size="small" color="error" onClick={() => handleRemoveMessage(msg.id)}>削除</Button>
                        </Box>
                    ))}
                </Box>

                {/* メッセージ追加 */}
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <TextField
                        label="新しいメッセージ"
                        value={currentMessage}
                        onChange={(e) => setCurrentMessage(e.target.value)}
                        fullWidth
                    />
                    <Button variant="contained" onClick={handleAddMessage} sx={{ minWidth: '100px' }}>
                        追加
                    </Button>
                </Box>

                <FormControl fullWidth margin="normal">
                    <InputLabel>切り替えエフェクト</InputLabel>
                    <Select
                        value={transitionEffect}
                        label="切り替えエフェクト"
                        onChange={(e) => setTransitionEffect(e.target.value)}
                    >
                        <MenuItem value={'fade'}>フェード (fade)</MenuItem>
                        <MenuItem value={'slide'}>スライド (slide)</MenuItem>
                    </Select>
                </FormControl>

                <TextField
                    label="エフェクトの秒数 (秒)"
                    type="number"
                    value={transitionDuration}
                    onChange={(e) => setTransitionDuration(Number(e.target.value))}
                    fullWidth
                    margin="normal"
                    inputProps={{ min: 1 }}
                />
            </Paper>

            <Button
                variant="contained"
                color="primary"
                onClick={handleSubmit}
                disabled={status === 'loading'}
                fullWidth
                size="large"
            >
                {status === 'loading' ? '更新中...' : 'OBSに反映'}
            </Button>

            {status === 'success' && (
                <Typography color="success.main" align="center" sx={{ mt: 2 }}>
                    ✅ データが正常に更新されました！
                </Typography>
            )}
            {status === 'error' && (
                <Typography color="error" align="center" sx={{ mt: 2 }}>
                    ❌ 更新に失敗しました。
                </Typography>
            )}

            <Box sx={{ mt: 4, p: 2, border: '1px dashed #ccc' }}>
                <Typography variant="body2" color="textSecondary">
                    OBS ブラウザソースURL: <code style={{ backgroundColor: '#eee', padding: '2px 4px', borderRadius: '4px' }}>{window.location.origin}/obs-overlay</code>
                </Typography>
            </Box>
        </Box>
    );
};

export default ControlPanel;