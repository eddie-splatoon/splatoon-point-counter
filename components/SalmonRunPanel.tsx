'use client';

import RemoveCircleIcon from '@mui/icons-material/RemoveCircle';
import {
    Alert,
    Box,
    Button,
    FormControl,
    IconButton,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
} from '@mui/material';
import axios from 'axios';
import React, {useCallback, useEffect, useRef, useState} from 'react';

import {SalmonScheduleData, pickCurrentSchedule} from '../lib/salmonSchedule';
import {MAX_COUNT, MAX_WAVE, SalmonJob, SalmonSessionWithTotals, SalmonSummary} from '../lib/salmonTypes';

import SalmonStats from './SalmonStats';

const paperSx = {mb: 3, p: 3, bgcolor: 'background.paper', backdropFilter: 'blur(10px)', border: '1px solid rgba(255, 255, 255, 0.1)'};
const listSx = {my: 2, maxHeight: 240, overflowY: 'auto', p: 1, bgcolor: 'rgba(255, 255, 255, 0.03)', borderRadius: '4px'};

const NUMBER_FIELDS = [
    {key: 'goldenEggs', label: '金イクラ'},
    {key: 'bossKills', label: 'オオモノ'},
    {key: 'deaths', label: 'デス'},
] as const;

type NumberKey = typeof NUMBER_FIELDS[number]['key'];

const EMPTY_NUMBERS: Record<NumberKey, string> = {goldenEggs: '', bossKills: '', deaths: ''};

const isCount = (value: string) => /^\d+$/.test(value) && Number(value) <= MAX_COUNT;

const formatDateTime = (timestamp: number) =>
    new Date(timestamp).toLocaleString('ja-JP', {month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false});

const sessionLabel = (session: {id: number; startedAt: number; title: string}) =>
    `#${session.id} ${formatDateTime(session.startedAt)}${session.title ? ` ${session.title}` : ''}`;

const JobRow: React.FC<{job: SalmonJob; index: number; onDelete?: (id: number) => void}> = ({job, index, onDelete}) => (
    <Box sx={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 0.5, borderBottom: '1px dotted rgba(255,255,255,0.2)'}}>
        <Typography variant="body2">
            {index} | {job.cleared ? 'クリア' : `WAVE${job.waveReached} 失敗`} | 金イクラ {job.goldenEggs} / オオモノ {job.bossKills} / デス {job.deaths}
            {job.stage && ` | ${job.stage}`} | {formatDateTime(job.createdAt)}
        </Typography>
        {onDelete && (
            <IconButton size="small" color="error" onClick={() => onDelete(job.id)} aria-label={`記録 ${index} を削除`}>
                <RemoveCircleIcon fontSize="small"/>
            </IconButton>
        )}
    </Box>
);

/** コントロールパネルの「サーモンラン」タブ。記録はボタンを押した時点で保存される（「OBSに反映」は不要） */
const SalmonRunPanel: React.FC = () => {
    const [summary, setSummary] = useState<SalmonSummary | null>(null);
    const [sessions, setSessions] = useState<SalmonSessionWithTotals[]>([]);
    const [numbers, setNumbers] = useState(EMPTY_NUMBERS);
    const [cleared, setCleared] = useState(true);
    const [waveReached, setWaveReached] = useState(1);
    const [stage, setStage] = useState('');
    const [newSessionTitle, setNewSessionTitle] = useState('');
    const [pastSessionId, setPastSessionId] = useState<number | ''>('');
    const [pastSummary, setPastSummary] = useState<SalmonSummary | null>(null);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    // 過去セッションを素早く切り替えたとき、古い応答で表示を上書きしないための最新の選択
    const latestPastSessionId = useRef<number | ''>('');

    // 一覧は表示の補助なので、失敗しても記録や削除の失敗としては扱わない（再操作による二重記録を防ぐ）
    const loadSessions = useCallback(async () => {
        try {
            const res = await axios.get<SalmonSessionWithTotals[]>('/api/salmon/sessions');
            setSessions(res.data);
        } catch (e) {
            console.error('Failed to load salmon sessions', e);
        }
    }, []);

    const load = useCallback(async () => {
        try {
            const res = await axios.get<SalmonSummary>('/api/salmon');
            setSummary(res.data);
            await loadSessions();
        } catch {
            setError('記録の読み込みに失敗しました。サーバーを確認してください。');
        }
    }, [loadSessions]);

    // ステージ欄が空なら、いま開催中のスケジュールのステージ名を入れる（手入力した値は上書きしない）
    const fillStageFromSchedule = useCallback(async () => {
        try {
            const res = await axios.get<SalmonScheduleData>('/api/salmon-schedule');
            const current = pickCurrentSchedule(res.data.entries, Date.now());
            if (current) setStage((prev) => prev || current.stage.name);
        } catch (e) {
            // スケジュールは入力の補助なので、取れなくても手入力で記録できる
            console.error('Failed to load the salmon run schedule', e);
        }
    }, []);

    useEffect(() => {
        // マウント時に API から記録を読み込む（burndown-overlay の初回取得と同じパターン）
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void load();
        void fillStageFromSchedule();
    }, [load, fillStageFromSchedule]);

    const canSubmit = !saving && NUMBER_FIELDS.every(({key}) => isCount(numbers[key]));

    const handleSubmit = async () => {
        if (!canSubmit) return;
        setSaving(true);
        setError('');
        try {
            const res = await axios.post<SalmonSummary>('/api/salmon', {
                goldenEggs: Number(numbers.goldenEggs),
                bossKills: Number(numbers.bossKills),
                deaths: Number(numbers.deaths),
                cleared,
                waveReached: cleared ? MAX_WAVE : waveReached,
                stage,
            });
            setSummary(res.data);
            setNumbers(EMPTY_NUMBERS);
            setCleared(true);
            await loadSessions();
        } catch {
            setError('記録に失敗しました。入力内容とサーバーを確認してください。');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: number) => {
        setError('');
        try {
            const res = await axios.delete<SalmonSummary>(`/api/salmon?id=${id}`);
            setSummary(res.data);
            await loadSessions();
        } catch {
            setError('記録の削除に失敗しました。');
        }
    };

    const handleStartSession = async () => {
        setError('');
        try {
            await axios.post('/api/salmon/sessions', {title: newSessionTitle});
            setNewSessionTitle('');
            await load();
        } catch {
            setError('セッションの開始に失敗しました。');
        }
    };

    const handleSelectPastSession = async (id: number | '') => {
        latestPastSessionId.current = id;
        setPastSessionId(id);
        setPastSummary(null);
        if (id === '') return;
        try {
            const res = await axios.get<SalmonSummary>(`/api/salmon?sessionId=${id}`);
            if (latestPastSessionId.current === id) setPastSummary(res.data);
        } catch {
            if (latestPastSessionId.current === id) setError('セッションの読み込みに失敗しました。');
        }
    };

    if (!summary) {
        return error ? <Alert severity="error">{error}</Alert> : <Typography>読み込み中...</Typography>;
    }

    const currentSessionId = summary.session?.id;
    const pastSessions = sessions.filter((s) => s.id !== currentSessionId);

    return (
        <>
            {error && <Alert severity="error" sx={{mb: 2}}>{error}</Alert>}

            <Paper elevation={12} sx={paperSx}>
                <Typography variant="h6" gutterBottom>🐟 バイトの記録</Typography>
                <Box sx={{display: 'flex', gap: 1}}>
                    {NUMBER_FIELDS.map(({key, label}) => (
                        <TextField
                            key={key}
                            label={label}
                            type="number"
                            value={numbers[key]}
                            onChange={(e) => setNumbers({...numbers, [key]: e.target.value})}
                            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                            slotProps={{htmlInput: {min: 0, max: MAX_COUNT, step: 1}}}
                            margin="normal"
                            fullWidth
                        />
                    ))}
                </Box>
                <Box sx={{display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap', mt: 1}}>
                    <ToggleButtonGroup value={cleared} exclusive onChange={(e, value) => value !== null && setCleared(value)} aria-label="結果">
                        <ToggleButton value={true} color="success">クリア</ToggleButton>
                        <ToggleButton value={false} color="error">失敗</ToggleButton>
                    </ToggleButtonGroup>
                    {!cleared && (
                        <FormControl sx={{minWidth: 140}}>
                            <InputLabel id="salmon-wave-label">失敗した WAVE</InputLabel>
                            <Select labelId="salmon-wave-label" label="失敗した WAVE" value={waveReached} onChange={(e) => setWaveReached(Number(e.target.value))}>
                                {Array.from({length: MAX_WAVE}, (_, i) => i + 1).map((wave) => (
                                    <MenuItem key={wave} value={wave}>WAVE{wave}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    )}
                    <TextField label="ステージ" value={stage} onChange={(e) => setStage(e.target.value)} sx={{flex: 1, minWidth: 160}}/>
                </Box>
                <Button variant="contained" onClick={handleSubmit} disabled={!canSubmit} fullWidth sx={{mt: 2}}>
                    {saving ? '記録中...' : '記録'}
                </Button>
                <Typography variant="caption" sx={{display: 'block', mt: 1, color: 'text.secondary'}}>
                    記録はすぐに保存され、オーバーレイに反映されます（「OBSに反映」ボタンは不要です）。ステージは次の記録にも引き継がれます。
                </Typography>
            </Paper>

            <Paper elevation={12} sx={paperSx}>
                <Typography variant="h6" gutterBottom>
                    今のセッション{summary.session ? `: ${sessionLabel(summary.session)}` : '（最初の記録で自動作成）'}
                </Typography>
                <Box sx={{display: 'flex', gap: 2, alignItems: 'flex-start', flexWrap: 'wrap'}}>
                    <SalmonStats lastJob={summary.lastJob} totals={summary.totals}/>
                    <Box data-testid="salmon-history" sx={{...listSx, my: 0, flex: 1, minWidth: 260}}>
                        {summary.jobs.length === 0 ? (
                            <Typography variant="body2" sx={{color: 'text.secondary', p: 1}}>記録がありません</Typography>
                        ) : (
                            summary.jobs.map((job, i) => (
                                <JobRow key={job.id} job={job} index={summary.jobs.length - i} onDelete={handleDelete}/>
                            ))
                        )}
                    </Box>
                </Box>
                <Box sx={{display: 'flex', gap: 1, alignItems: 'center', mt: 2}}>
                    <TextField label="新しいセッションのタイトル（任意）" value={newSessionTitle} onChange={(e) => setNewSessionTitle(e.target.value)} fullWidth/>
                    <Button variant="outlined" color="secondary" onClick={handleStartSession} sx={{minWidth: 200}}>新しいセッションを開始</Button>
                </Box>
                <Typography variant="caption" sx={{display: 'block', mt: 1, color: 'text.secondary'}}>
                    配信の開始時に押してください。「本日」の合計は新しいセッションから数え直します。
                </Typography>
            </Paper>

            <Paper elevation={12} sx={paperSx}>
                <Typography variant="h6" gutterBottom>📜 過去のセッション</Typography>
                <FormControl fullWidth margin="normal">
                    <InputLabel id="salmon-past-session-label">セッションを選択</InputLabel>
                    <Select
                        labelId="salmon-past-session-label"
                        label="セッションを選択"
                        value={pastSessionId}
                        onChange={(e) => handleSelectPastSession(e.target.value as number | '')}
                    >
                        <MenuItem value="">選択しない</MenuItem>
                        {pastSessions.map((s) => (
                            <MenuItem key={s.id} value={s.id}>
                                {sessionLabel(s)}（{s.totals.jobs}回 / 金イクラ {s.totals.goldenEggs}）
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
                {pastSessions.length === 0 && (
                    <Typography variant="body2" sx={{color: 'text.secondary'}}>過去のセッションはまだありません</Typography>
                )}
                {pastSummary && (
                    <Box sx={{display: 'flex', gap: 2, alignItems: 'flex-start', flexWrap: 'wrap', mt: 1}}>
                        <SalmonStats lastJob={pastSummary.lastJob} totals={pastSummary.totals}/>
                        <Box data-testid="salmon-past-history" sx={{...listSx, my: 0, flex: 1, minWidth: 260}}>
                            {pastSummary.jobs.map((job, i) => (
                                <JobRow key={job.id} job={job} index={pastSummary.jobs.length - i}/>
                            ))}
                        </Box>
                    </Box>
                )}
            </Paper>
        </>
    );
};

export default SalmonRunPanel;
