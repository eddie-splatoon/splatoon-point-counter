'use client';

import {
    Alert,
    Box,
    Button,
    FormControl,
    FormControlLabel,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    Slider,
    Switch,
    Typography,
} from '@mui/material';
import axios from 'axios';
import React, {useCallback, useEffect, useRef, useState} from 'react';

import {
    MAX_SPEED_SCALE,
    MAX_VOLUME_SCALE,
    MIN_SPEED_SCALE,
    MIN_VOLUME_SCALE,
    VoiceSettings,
    VoiceSpeaker,
    voiceCredit,
} from '../lib/voiceTypes';

const paperSx = {mb: 3, p: 3, bgcolor: 'background.paper', backdropFilter: 'blur(10px)', border: '1px solid rgba(255, 255, 255, 0.1)'};

const TEST_TEXT = 'テスト再生です。聞こえていますか？';

/** コントロールパネルの読み上げ（VOICEVOX）の設定。変更はその場で保存される */
const VoiceSettingsPanel: React.FC = () => {
    const [settings, setSettings] = useState<VoiceSettings | null>(null);
    // null は読み込み中、文字列は VOICEVOX に接続できなかったときのメッセージ
    const [speakers, setSpeakers] = useState<VoiceSpeaker[] | string | null>(null);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    // 保存は1件ずつ順に送る（並行して送ると、後の変更より先の変更が後に届いて残ることがある）
    const saveQueue = useRef<Promise<void>>(Promise.resolve());

    const load = useCallback(async () => {
        try {
            setSettings((await axios.get<VoiceSettings>('/api/voice')).data);
        } catch {
            setError('読み上げの設定の読み込みに失敗しました。サーバーを確認してください。');
        }
    }, []);

    const loadSpeakers = useCallback(async () => {
        setSpeakers(null);
        try {
            setSpeakers((await axios.get<VoiceSpeaker[]>('/api/voice/speakers')).data);
        } catch {
            setSpeakers('VOICEVOX に接続できません。VOICEVOX を起動してから「再読み込み」を押してください。');
        }
    }, []);

    useEffect(() => {
        // マウント時に API から設定と話者の一覧を読み込む（TelopPanel と同じパターン）
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void load();
        void loadSpeakers();
    }, [load, loadSpeakers]);

    if (!settings) {
        return error ? <Alert severity="error">{error}</Alert> : <Typography>読み込み中...</Typography>;
    }

    const save = (delta: Partial<VoiceSettings>) => {
        const next = {...settings, ...delta};
        setSettings(next);
        setError('');
        // 表示は送信前に更新しておく。応答で上書きすると、素早い連続操作で古い応答が新しい状態を戻してしまう
        saveQueue.current = saveQueue.current.then(async () => {
            try {
                await axios.post('/api/voice', next);
            } catch {
                setError('読み上げの設定の保存に失敗しました。');
                await load();
            }
        });
    };

    const handleSpeakerChange = (value: number | '') => {
        if (value === '') {
            save({speakerId: null, speakerName: ''});
            return;
        }
        const speaker = Array.isArray(speakers) ? speakers.find((s) => s.styles.some((style) => style.id === value)) : undefined;
        save({speakerId: value, speakerName: speaker?.name ?? settings.speakerName});
    };

    const handleTest = async () => {
        setNotice('');
        setError('');
        try {
            await saveQueue.current;
            await axios.post('/api/speech', {text: TEST_TEXT});
            setNotice('読み上げキューに追加しました。音声専用オーバーレイ（/voice-overlay）から再生されます。');
        } catch {
            setError('テスト再生を追加できませんでした。読み上げを有効にして、話者を選んでください。');
        }
    };

    const speakerOptions = Array.isArray(speakers)
        ? speakers.flatMap((speaker) => speaker.styles.map((style) => ({id: style.id, label: `${speaker.name}（${style.name}）`})))
        : [];
    // 保存済みの話者が一覧に無い（VOICEVOX 未起動など）ときも、選択中の値として表示する
    const selectedMissing = settings.speakerId !== null && !speakerOptions.some((o) => o.id === settings.speakerId);

    return (
        <Paper elevation={12} sx={paperSx}>
            <Typography variant="h6" gutterBottom>🔊 読み上げ（VOICEVOX）</Typography>
            {error && <Alert severity="error" sx={{mb: 2}}>{error}</Alert>}
            {notice && <Alert severity="success" sx={{mb: 2}}>{notice}</Alert>}

            <FormControlLabel
                label="読み上げを有効にする"
                control={<Switch checked={settings.enabled} onChange={(e) => save({enabled: e.target.checked})}/>}
            />

            {typeof speakers === 'string' && (
                <Alert severity="warning" sx={{my: 1}} action={<Button color="inherit" size="small" onClick={() => void loadSpeakers()}>再読み込み</Button>}>
                    {speakers}
                </Alert>
            )}
            <FormControl fullWidth margin="normal">
                <InputLabel id="voice-speaker-label">話者</InputLabel>
                <Select
                    labelId="voice-speaker-label"
                    label="話者"
                    value={settings.speakerId ?? ''}
                    onChange={(e) => handleSpeakerChange(e.target.value as number | '')}
                >
                    <MenuItem value="">（未選択）</MenuItem>
                    {selectedMissing && <MenuItem value={settings.speakerId ?? ''}>{settings.speakerName || `ID ${settings.speakerId}`}</MenuItem>}
                    {speakerOptions.map((option) => <MenuItem key={option.id} value={option.id}>{option.label}</MenuItem>)}
                </Select>
            </FormControl>

            <Box sx={{px: 1}}>
                <Typography gutterBottom>速度: {settings.speedScale.toFixed(1)}</Typography>
                <Slider
                    aria-label="速度"
                    value={settings.speedScale}
                    min={MIN_SPEED_SCALE}
                    max={MAX_SPEED_SCALE}
                    step={0.1}
                    onChange={(e, value) => setSettings({...settings, speedScale: value as number})}
                    onChangeCommitted={(e, value) => save({speedScale: value as number})}
                />
                <Typography gutterBottom>音量: {settings.volumeScale.toFixed(1)}</Typography>
                <Slider
                    aria-label="音量"
                    value={settings.volumeScale}
                    min={MIN_VOLUME_SCALE}
                    max={MAX_VOLUME_SCALE}
                    step={0.1}
                    onChange={(e, value) => setSettings({...settings, volumeScale: value as number})}
                    onChangeCommitted={(e, value) => save({volumeScale: value as number})}
                />
            </Box>

            <Button variant="outlined" onClick={() => void handleTest()} disabled={!settings.enabled || settings.speakerId === null}>テスト再生</Button>

            {settings.speakerName && (
                <Alert severity="info" sx={{mt: 2}}>
                    クレジット表記: <strong>{voiceCredit(settings.speakerName)}</strong>
                    <br/>
                    配信の概要欄やパネルに記載してください。キャラクターごとの利用規約は VOICEVOX 公式サイトの各キャラクターのページで確認できます。
                </Alert>
            )}
            <Typography variant="caption" sx={{display: 'block', mt: 1, color: 'text.secondary'}}>
                音声は、OBS に追加した音声専用オーバーレイ（/voice-overlay）から再生されます。VOICEVOX を起動しておいてください。
            </Typography>
        </Paper>
    );
};

export default VoiceSettingsPanel;
