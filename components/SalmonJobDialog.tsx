'use client';

import {
    Alert,
    Box,
    Button,
    DialogActions,
    FormControl,
    IconButton,
    InputLabel,
    MenuItem,
    Select,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
} from '@mui/material';
import axios from 'axios';
import React, {useState} from 'react';

import {
    MAX_COUNT,
    NewSalmonJob,
    SALMON_JOB_KINDS,
    SALMON_JOB_KIND_LABELS,
    SalmonJob,
    SalmonJobKind,
    SalmonSummary,
    maxWaveFor,
} from '../lib/salmonTypes';
import {MAX_JOB_WEAPONS, findSalmonWeapon} from '../lib/salmonWeapons';

import LiveDialog from './LiveDialog';
import WeaponIcon from './WeaponIcon';
import WeaponPicker from './WeaponPicker';

const NUMBER_FIELDS = [
    {key: 'goldenEggs', label: '金イクラ'},
    {key: 'bossKills', label: 'オオモノ'},
    {key: 'deaths', label: 'デス'},
] as const;

type NumberKey = typeof NUMBER_FIELDS[number]['key'];

const isCount = (value: string) => /^\d+$/.test(value) && Number(value) <= MAX_COUNT;

/** 修正する記録（一覧での番号つき） */
export interface EditingJob {
    job: SalmonJob;
    index: number;
}

interface SalmonJobDialogProps {
    /** 修正する記録。null なら新しく記録する */
    editing: EditingJob | null;
    /** 新しく記録するときのステージ・バイトの種類（前回の値か、開催中のスケジュール） */
    defaults: {stage: string; jobKind: SalmonJobKind};
    onClose: () => void;
    /** 保存できたとき（新しい記録なら、使ったステージ・種類を次の記録に引き継ぐ） */
    onSaved: (summary: SalmonSummary, job: NewSalmonJob) => void;
}

/**
 * バイトを手で記録する・記録を修正するダイアログ（取り込めなかったとき・読み間違いを直すとき）。
 * 支給ブキのパレットは大きいので、「ブキを選ぶ」を押したときだけ開く。開くたびに作り直す（親が open のときだけ置く）
 */
const SalmonJobDialog: React.FC<SalmonJobDialogProps> = ({editing, defaults, onClose, onSaved}) => {
    const job = editing?.job;
    const [numbers, setNumbers] = useState<Record<NumberKey, string>>(
        job ? {goldenEggs: String(job.goldenEggs), bossKills: String(job.bossKills), deaths: String(job.deaths)} : {goldenEggs: '', bossKills: '', deaths: ''},
    );
    const [cleared, setCleared] = useState(job?.cleared ?? true);
    const [waveReached, setWaveReached] = useState(job?.waveReached ?? 1);
    const [jobKind, setJobKind] = useState<SalmonJobKind>(job?.jobKind ?? defaults.jobKind);
    const [stage, setStage] = useState(job ? job.stage : defaults.stage);
    const [weapons, setWeapons] = useState<string[]>(job?.weapons ?? []);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const canSubmit = !saving && NUMBER_FIELDS.every(({key}) => isCount(numbers[key]));

    const handleSubmit = async () => {
        if (!canSubmit) return;
        setSaving(true);
        setError('');
        const newJob: NewSalmonJob = {
            goldenEggs: Number(numbers.goldenEggs),
            bossKills: Number(numbers.bossKills),
            deaths: Number(numbers.deaths),
            cleared,
            waveReached: cleared ? maxWaveFor(jobKind) : Math.min(waveReached, maxWaveFor(jobKind)),
            stage,
            weapons,
            jobKind,
        };
        try {
            // 修正は日時（取り込んだバイトの played_at）を残すので、次の取り込みで同じバイトを二重に記録しない
            const res = editing
                ? await axios.patch<SalmonSummary>('/api/salmon', {...newJob, id: editing.job.id})
                : await axios.post<SalmonSummary>('/api/salmon', newJob);
            onSaved(res.data, newJob);
        } catch {
            setError(editing ? '記録の修正に失敗しました。入力内容とサーバーを確認してください。' : '記録に失敗しました。入力内容とサーバーを確認してください。');
            setSaving(false);
        }
    };

    return (
        <LiveDialog
            open
            onClose={onClose}
            title={editing ? `記録 ${editing.index} を修正` : 'バイトを手で記録'}
            actions={(
                <DialogActions sx={{px: 6, pb: 5}}>
                    <Button variant="outlined" onClick={onClose}>やめる</Button>
                    <Button variant="contained" color="success" onClick={handleSubmit} disabled={!canSubmit}>
                        {saving ? '保存中...' : editing ? '修正を保存' : '記録する'}
                    </Button>
                </DialogActions>
            )}
        >
            <Typography variant="body2" sx={{mb: 3, color: 'text.secondary'}}>
                {editing
                    ? '取り込みの読み間違いは、削除して手入力し直さずにここで直してください（削除すると次の取り込みで同じバイトがもう一度記録されます）。'
                    : '取り込めなかったときだけ。ステージとバイトの種類は前回の値（なければ開催中のもの）が入っています。'}
            </Typography>
            {error && <Alert severity="error" sx={{mb: 2}}>{error}</Alert>}
            <Box sx={{display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 2.5}}>
                {NUMBER_FIELDS.map(({key, label}) => (
                    <TextField
                        key={key}
                        label={label}
                        type="number"
                        value={numbers[key]}
                        onChange={(e) => setNumbers({...numbers, [key]: e.target.value})}
                        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                        slotProps={{htmlInput: {min: 0, max: MAX_COUNT, step: 1, inputMode: 'numeric'}}}
                        autoFocus={key === 'goldenEggs'}
                    />
                ))}
            </Box>
            <Box sx={{display: 'flex', gap: 2.5, alignItems: 'center', flexWrap: 'wrap', mt: 3}}>
                <ToggleButtonGroup value={cleared} exclusive onChange={(e, value) => value !== null && setCleared(value)} aria-label="結果">
                    <ToggleButton value={true} color="success">クリア</ToggleButton>
                    <ToggleButton value={false} color="error">失敗</ToggleButton>
                </ToggleButtonGroup>
                {!cleared && (
                    <FormControl sx={{minWidth: 140}}>
                        <InputLabel id="salmon-wave-label">失敗した WAVE</InputLabel>
                        <Select
                            labelId="salmon-wave-label"
                            label="失敗した WAVE"
                            value={Math.min(waveReached, maxWaveFor(jobKind))}
                            onChange={(e) => setWaveReached(Number(e.target.value))}
                        >
                            {Array.from({length: maxWaveFor(jobKind)}, (_, i) => i + 1).map((wave) => (
                                <MenuItem key={wave} value={wave}>WAVE{wave}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                )}
                <FormControl sx={{minWidth: 200}}>
                    <InputLabel id="salmon-kind-label">バイトの種類</InputLabel>
                    <Select labelId="salmon-kind-label" label="バイトの種類" value={jobKind} onChange={(e) => setJobKind(e.target.value as SalmonJobKind)}>
                        {SALMON_JOB_KINDS.map((kind) => (
                            <MenuItem key={kind} value={kind}>{SALMON_JOB_KIND_LABELS[kind]}</MenuItem>
                        ))}
                    </Select>
                </FormControl>
                <TextField label="ステージ" value={stage} onChange={(e) => setStage(e.target.value)} sx={{flex: '1 1 160px'}}/>
            </Box>
            <Box sx={{mt: 3, p: 3, borderRadius: '10px', bgcolor: 'rgba(255,255,255,0.04)'}}>
                <Box sx={{display: 'flex', alignItems: 'center', gap: 2, minHeight: 44}}>
                    <Typography variant="body2" sx={{color: 'text.secondary'}}>支給ブキ（任意・{MAX_JOB_WEAPONS} つまで）</Typography>
                    <Box data-testid="salmon-selected-weapons" sx={{display: 'flex', gap: 0.5, flex: 1}}>
                        {weapons.map((key, i) => {
                            const weapon = findSalmonWeapon(key);
                            return weapon && (
                                <IconButton
                                    key={i}
                                    size="small"
                                    onClick={() => setWeapons(weapons.filter((_, j) => j !== i))}
                                    aria-label={`支給ブキ ${i + 1} つ目の${weapon.name}を外す`}
                                >
                                    <WeaponIcon weapon={weapon} size={36}/>
                                </IconButton>
                            );
                        })}
                    </Box>
                    <Button variant="outlined" onClick={() => setPickerOpen(!pickerOpen)} aria-expanded={pickerOpen}>
                        {pickerOpen ? 'パレットを閉じる' : 'ブキを選ぶ'}
                    </Button>
                </Box>
                {/* 同じブキが続けて支給されることもあるので、押すたびに追加する（外すときは上の選んだブキを押す） */}
                {pickerOpen && (
                    <Box sx={{mt: 2}}>
                        <WeaponPicker
                            label="支給ブキ"
                            selected={weapons}
                            onSelect={(key) => setWeapons((current) => current.length < MAX_JOB_WEAPONS ? [...current, key] : current)}
                            isDisabled={() => weapons.length >= MAX_JOB_WEAPONS}
                        />
                    </Box>
                )}
            </Box>
            <Typography variant="caption" sx={{display: 'block', mt: 2, color: 'text.secondary'}}>
                支給ブキを選ぶと、ブキ埋めカードも埋まります。
            </Typography>
        </LiveDialog>
    );
};

export default SalmonJobDialog;
