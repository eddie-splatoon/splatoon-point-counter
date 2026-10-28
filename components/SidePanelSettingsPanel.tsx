'use client';

import RemoveCircleIcon from '@mui/icons-material/RemoveCircle';
import {
    Alert,
    Box,
    Button,
    Checkbox,
    FormControlLabel,
    FormGroup,
    IconButton,
    Paper,
    Switch,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
} from '@mui/material';
import axios from 'axios';
import React, {useCallback, useEffect, useState} from 'react';

import {
    Challenge,
    MAX_CHALLENGES,
    MAX_CHALLENGE_LENGTH,
    MAX_CHALLENGE_LINES,
    MAX_FOLLOWER_GOAL,
    MAX_ROTATE_SECONDS,
    MIN_ROTATE_SECONDS,
    SIDE_PANEL_SLOTS,
    SIDE_PANEL_SLOT_LABELS,
    SidePanelSettings,
    SidePanelSlot,
    normalizeChallengeText,
} from '../lib/sidePanelTypes';

const paperSx = {mb: 3, p: 3, bgcolor: 'background.paper', backdropFilter: 'blur(10px)', border: '1px solid rgba(255, 255, 255, 0.1)'};

const isValidSeconds = (value: string) =>
    /^\d+$/.test(value) && Number(value) >= MIN_ROTATE_SECONDS && Number(value) <= MAX_ROTATE_SECONDS;

// 空欄は「手入力の目標なし」
const isValidFollowerGoal = (value: string) =>
    value === '' || (/^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= MAX_FOLLOWER_GOAL);

/** コントロールパネルの「サイドパネル」タブ。変更はその場で保存される（「OBSに反映」は不要） */
const SidePanelSettingsPanel: React.FC = () => {
    const [settings, setSettings] = useState<SidePanelSettings | null>(null);
    const [secondsInput, setSecondsInput] = useState('');
    const [followerGoalInput, setFollowerGoalInput] = useState('');
    const [newChallenge, setNewChallenge] = useState('');
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        try {
            const res = await axios.get<SidePanelSettings>('/api/side-panel');
            setSettings(res.data);
            setSecondsInput(String(res.data.rotateSeconds));
            setFollowerGoalInput(res.data.followerGoal === null ? '' : String(res.data.followerGoal));
        } catch {
            setError('サイドパネルの設定の読み込みに失敗しました。サーバーを確認してください。');
        }
    }, []);

    useEffect(() => {
        // マウント時に API から設定を読み込む（SalmonRunPanel と同じパターン）
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void load();
    }, [load]);

    const save = async (delta: Partial<SidePanelSettings>) => {
        if (!settings) return;
        const next = {...settings, ...delta};
        setSettings(next);
        setError('');
        // 表示は送信前に更新しておく。応答で上書きすると、素早い連続操作で古い応答が新しい選択を戻してしまう
        try {
            await axios.post('/api/side-panel', next);
        } catch {
            setError('設定の保存に失敗しました。');
            await load();
        }
    };

    if (!settings) {
        return error ? <Alert severity="error">{error}</Alert> : <Typography>読み込み中...</Typography>;
    }

    const saveChallenges = (challenges: Challenge[]) => void save({challenges});

    // 改行は配信画面で折り返したい位置としてそのまま残す（各行の前後の空白と空行は除く）
    const normalizedChallenge = normalizeChallengeText(newChallenge);
    const canAddChallenge = normalizedChallenge !== null && settings.challenges.length < MAX_CHALLENGES;

    const handleAddChallenge = () => {
        if (!canAddChallenge) return;
        const id = Math.max(0, ...settings.challenges.map((c) => c.id)) + 1;
        saveChallenges([...settings.challenges, {id, text: normalizedChallenge, done: false}]);
        setNewChallenge('');
    };

    const toggleEnabled = (slot: SidePanelSlot, checked: boolean) => {
        const enabledSlots = checked ? [...settings.enabledSlots, slot] : settings.enabledSlots.filter((s) => s !== slot);
        void save({enabledSlots});
    };

    const handleSecondsChange = (value: string) => {
        setSecondsInput(value);
        if (isValidSeconds(value)) void save({rotateSeconds: Number(value)});
    };

    const handleFollowerGoalChange = (value: string) => {
        setFollowerGoalInput(value);
        if (isValidFollowerGoal(value)) void save({followerGoal: value === '' ? null : Number(value)});
    };

    return (
        <>
            {error && <Alert severity="error" sx={{mb: 2}}>{error}</Alert>}

            <Paper elevation={12} sx={paperSx}>
                <Typography variant="h6" gutterBottom>🦑 フォロワー目標（上段のゲージ）</Typography>
                <TextField
                    label="目標フォロワー数"
                    type="number"
                    value={followerGoalInput}
                    onChange={(e) => handleFollowerGoalChange(e.target.value)}
                    error={!isValidFollowerGoal(followerGoalInput)}
                    helperText="Twitch でフォロワー目標を設定している場合はそちらを優先します。空欄で、Twitch の目標が無いときはゲージを表示しません。"
                    slotProps={{htmlInput: {min: 1, max: MAX_FOLLOWER_GOAL, step: 1}}}
                    fullWidth
                    margin="normal"
                />
                <Typography variant="caption" sx={{display: 'block', color: 'text.secondary'}}>
                    フォロワー数は Twitch 連携（<code>pnpm twitch</code>）から取得します。起動していないときはゲージを表示しません。
                </Typography>
            </Paper>

            <Paper elevation={12} sx={paperSx}>
                <Typography variant="h6" gutterBottom>📝 本日のお題</Typography>
                <Box data-testid="challenge-editor" sx={{my: 1}}>
                    {settings.challenges.length === 0 ? (
                        <Typography variant="body2" sx={{color: 'text.secondary', p: 1}}>お題がありません</Typography>
                    ) : (
                        settings.challenges.map((challenge) => (
                            <Box key={challenge.id} sx={{display: 'flex', alignItems: 'center', borderBottom: '1px dotted rgba(255,255,255,0.2)'}}>
                                <FormControlLabel
                                    sx={{flex: 1, mr: 0}}
                                    label={<span style={{whiteSpace: 'pre-line'}}>{challenge.text}</span>}
                                    control={
                                        <Checkbox
                                            checked={challenge.done}
                                            onChange={(e) => saveChallenges(settings.challenges.map((c) => c.id === challenge.id ? {...c, done: e.target.checked} : c))}
                                        />
                                    }
                                />
                                <IconButton
                                    size="small"
                                    color="error"
                                    onClick={() => saveChallenges(settings.challenges.filter((c) => c.id !== challenge.id))}
                                    aria-label={`お題「${challenge.text.replace(/\n/g, ' ')}」を削除`}
                                >
                                    <RemoveCircleIcon fontSize="small"/>
                                </IconButton>
                            </Box>
                        ))
                    )}
                </Box>
                <Box sx={{display: 'flex', gap: 1, alignItems: 'flex-start'}}>
                    <TextField
                        label="新しいお題"
                        value={newChallenge}
                        onChange={(e) => setNewChallenge(e.target.value)}
                        // Enter は改行。Ctrl / ⌘ + Enter で追加する（変換中は追加しない。追加時はブラウザが改行を入れないよう止める）
                        onKeyDown={(e) => {
                            if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey) || e.nativeEvent.isComposing) return;
                            e.preventDefault();
                            handleAddChallenge();
                        }}
                        error={newChallenge.trim() !== '' && normalizedChallenge === null}
                        helperText={`改行を入れると、その位置で折り返して表示します（${MAX_CHALLENGE_LINES} 行・改行を除いて ${MAX_CHALLENGE_LENGTH} 文字まで）。Ctrl / ⌘ + Enter で追加できます。`}
                        multiline
                        minRows={2}
                        maxRows={MAX_CHALLENGE_LINES}
                        fullWidth
                    />
                    <Button variant="contained" onClick={handleAddChallenge} disabled={!canAddChallenge} sx={{minWidth: '100px'}}>追加</Button>
                </Box>
                <Typography variant="caption" sx={{display: 'block', mt: 1, color: 'text.secondary'}}>
                    最大 {MAX_CHALLENGES} 個（2〜4 個がおすすめ）。チェックを入れると、オーバーレイでスタンプが押されます。サイドパネルに出すには、下のスロットで「本日のお題」を選んでください。
                </Typography>
            </Paper>

            <Paper elevation={12} sx={paperSx}>
                <Typography variant="h6" gutterBottom>🧩 表示するスロット</Typography>
                <ToggleButtonGroup
                    value={settings.activeSlot}
                    exclusive
                    onChange={(e, value: SidePanelSlot | null) => value && save({activeSlot: value})}
                    disabled={settings.autoRotate}
                    aria-label="表示するスロット"
                >
                    {SIDE_PANEL_SLOTS.map((slot) => (
                        <ToggleButton key={slot} value={slot}>{SIDE_PANEL_SLOT_LABELS[slot]}</ToggleButton>
                    ))}
                </ToggleButtonGroup>
                <Typography variant="caption" sx={{display: 'block', mt: 1, color: 'text.secondary'}}>
                    {settings.autoRotate ? '自動ローテーション中は、下で選んだスロットを順に表示します。' : 'サイドパネル下段に表示する内容です。'}
                </Typography>
            </Paper>

            <Paper elevation={12} sx={paperSx}>
                <Typography variant="h6" gutterBottom>🔄 自動ローテーション</Typography>
                <FormControlLabel
                    control={<Switch checked={settings.autoRotate} onChange={(e) => save({autoRotate: e.target.checked})}/>}
                    label="一定時間ごとに切り替える"
                />
                <TextField
                    label="切り替え秒数"
                    type="number"
                    value={secondsInput}
                    onChange={(e) => handleSecondsChange(e.target.value)}
                    error={!isValidSeconds(secondsInput)}
                    helperText={`${MIN_ROTATE_SECONDS}〜${MAX_ROTATE_SECONDS} 秒`}
                    slotProps={{htmlInput: {min: MIN_ROTATE_SECONDS, max: MAX_ROTATE_SECONDS, step: 1}}}
                    fullWidth
                    margin="normal"
                />
                <Typography variant="subtitle2" sx={{mt: 1}}>ローテーションするスロット</Typography>
                <FormGroup row>
                    {SIDE_PANEL_SLOTS.map((slot) => {
                        const checked = settings.enabledSlots.includes(slot);
                        return (
                            <FormControlLabel
                                key={slot}
                                label={SIDE_PANEL_SLOT_LABELS[slot]}
                                control={
                                    <Checkbox
                                        checked={checked}
                                        // 最低1つは残す
                                        disabled={checked && settings.enabledSlots.length === 1}
                                        onChange={(e) => toggleEnabled(slot, e.target.checked)}
                                    />
                                }
                            />
                        );
                    })}
                </FormGroup>
                <Typography variant="caption" sx={{display: 'block', mt: 1, color: 'text.secondary'}}>
                    設定はすぐに保存され、オーバーレイに反映されます（「OBSに反映」ボタンは不要です）。
                </Typography>
            </Paper>
        </>
    );
};

export default SidePanelSettingsPanel;
