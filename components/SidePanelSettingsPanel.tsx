'use client';

import ViewSidebarRoundedIcon from '@mui/icons-material/ViewSidebarRounded';
import {Alert, Box, TextField, Typography} from '@mui/material';
import React, {useState} from 'react';

import {
    FULL_HEIGHT_SLOTS,
    MAX_FOLLOWER_GOAL,
    MAX_ROTATE_SECONDS,
    MIN_ROTATE_SECONDS,
    SIDE_PANEL_SLOTS,
    SIDE_PANEL_SLOT_LABELS,
    SLOT_AREA_HEIGHT,
    SidePanelSettings,
    SidePanelSlot,
    exceedsSlotArea,
} from '../lib/sidePanelTypes';

import ChoiceChip from './ChoiceChip';
import LiveCard from './LiveCard';
import {SidePanelSettingsState} from './useSidePanelSettings';

const isValidSeconds = (value: string) =>
    /^\d+$/.test(value) && Number(value) >= MIN_ROTATE_SECONDS && Number(value) <= MAX_ROTATE_SECONDS;

// 空欄は「手入力の目標なし」
const isValidFollowerGoal = (value: string) =>
    value === '' || (/^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= MAX_FOLLOWER_GOAL);

const labelSx = {display: 'block', mt: 4, mb: 1.5, fontSize: 12, color: 'text.secondary'} as const;

const SidePanelForm: React.FC<{settings: SidePanelSettings; update: SidePanelSettingsState['update']}> = ({settings, update}) => {
    const [secondsInput, setSecondsInput] = useState(String(settings.rotateSeconds));
    const [followerGoalInput, setFollowerGoalInput] = useState(settings.followerGoal === null ? '' : String(settings.followerGoal));

    // 表示順はサーバーと同じく SIDE_PANEL_SLOTS の順にそろえる。固定枠とローテーション枠の両方が空になる変更は無視する（最低1つは残す）
    const saveSlots = (fixedSlots: SidePanelSlot[], rotationSlots: SidePanelSlot[]) => {
        if (fixedSlots.length + rotationSlots.length === 0) return;
        update({
            fixedSlots: SIDE_PANEL_SLOTS.filter((slot) => fixedSlots.includes(slot)),
            rotationSlots: SIDE_PANEL_SLOTS.filter((slot) => rotationSlots.includes(slot)),
        });
    };

    const fixedFullHeight = settings.fixedSlots.some((slot) => FULL_HEIGHT_SLOTS.includes(slot));
    // 配信画面では見切れに気づきにくいので、収まらない見込みの組み合わせはここで知らせる
    const overflows = exceedsSlotArea(settings);

    const toggleFixed = (slot: SidePanelSlot) => {
        if (settings.fixedSlots.includes(slot)) {
            saveSlots(settings.fixedSlots.filter((s) => s !== slot), settings.rotationSlots);
            return;
        }
        if (FULL_HEIGHT_SLOTS.includes(slot)) {
            // 残りの高さいっぱいを使うスロットを固定するときは、それ1つだけにする
            saveSlots([slot], []);
            return;
        }
        // 固定枠に移したスロットはローテーション枠から外す。固定していた全高のスロットは、他を固定したら外す
        const fixed = [...settings.fixedSlots.filter((s) => !FULL_HEIGHT_SLOTS.includes(s)), slot];
        saveSlots(fixed, settings.rotationSlots.filter((s) => !fixed.includes(s)));
    };

    // 固定枠にあるスロットはローテーション枠のチップを無効にしているので、ここには来ない
    const toggleRotation = (slot: SidePanelSlot) => saveSlots(
        settings.fixedSlots,
        settings.rotationSlots.includes(slot) ? settings.rotationSlots.filter((s) => s !== slot) : [...settings.rotationSlots, slot],
    );

    const handleSecondsChange = (value: string) => {
        setSecondsInput(value);
        if (isValidSeconds(value)) update({rotateSeconds: Number(value)});
    };

    const handleFollowerGoalChange = (value: string) => {
        setFollowerGoalInput(value);
        if (isValidFollowerGoal(value)) update({followerGoal: value === '' ? null : Number(value)});
    };

    return (
        <>
            <Typography id="side-panel-fixed" component="span" sx={{...labelSx, mt: 0}}>固定枠（上から順に常に出す）</Typography>
            <Box role="group" aria-labelledby="side-panel-fixed" sx={{display: 'flex', flexWrap: 'wrap', gap: 1.5}}>
                {SIDE_PANEL_SLOTS.map((slot) => (
                    <ChoiceChip key={slot} selected={settings.fixedSlots.includes(slot)} onClick={() => toggleFixed(slot)}>
                        {SIDE_PANEL_SLOT_LABELS[slot]}
                    </ChoiceChip>
                ))}
            </Box>

            <Typography id="side-panel-rotation" component="span" sx={labelSx}>ローテーション枠（固定枠の下で順に切り替える）</Typography>
            <Box role="group" aria-labelledby="side-panel-rotation" sx={{display: 'flex', flexWrap: 'wrap', gap: 1.5}}>
                {SIDE_PANEL_SLOTS.map((slot) => (
                    <ChoiceChip
                        key={slot}
                        tone="success"
                        selected={settings.rotationSlots.includes(slot)}
                        disabled={fixedFullHeight || settings.fixedSlots.includes(slot)}
                        onClick={() => toggleRotation(slot)}
                    >
                        {SIDE_PANEL_SLOT_LABELS[slot]}
                    </ChoiceChip>
                ))}
            </Box>
            <Typography variant="caption" sx={{display: 'block', mt: 1.5}}>
                {fixedFullHeight
                    ? `${settings.fixedSlots.map((s) => SIDE_PANEL_SLOT_LABELS[s]).join('・')}を固定している間は、ローテーション枠は使えません。`
                    : `固定枠で選んだものは選べません。${FULL_HEIGHT_SLOTS.map((s) => SIDE_PANEL_SLOT_LABELS[s]).join('・')}を固定するときはそれ 1 つだけになります。`}
            </Typography>
            {overflows && (
                <Alert severity="warning" sx={{mt: 2}}>
                    固定枠とローテーション枠を合わせると、サイドパネル下段（約 {SLOT_AREA_HEIGHT}px）に収まらず、下が見切れる可能性があります。固定枠を減らすか、ローテーション枠に移してください（高さは目安です）。
                </Alert>
            )}

            <Box sx={{display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 2.5, mt: 4}}>
                <TextField
                    size="small"
                    label="切り替えの秒数"
                    type="number"
                    value={secondsInput}
                    onChange={(e) => handleSecondsChange(e.target.value)}
                    error={!isValidSeconds(secondsInput)}
                    helperText={`${MIN_ROTATE_SECONDS}〜${MAX_ROTATE_SECONDS} 秒`}
                    slotProps={{htmlInput: {min: MIN_ROTATE_SECONDS, max: MAX_ROTATE_SECONDS, step: 1}}}
                />
                <TextField
                    size="small"
                    label="フォロワー目標"
                    type="number"
                    value={followerGoalInput}
                    onChange={(e) => handleFollowerGoalChange(e.target.value)}
                    error={!isValidFollowerGoal(followerGoalInput)}
                    helperText="空欄なら Twitch の目標だけ"
                    slotProps={{htmlInput: {min: 1, max: MAX_FOLLOWER_GOAL, step: 1}}}
                />
            </Box>
            <Typography variant="caption" sx={{display: 'block', mt: 2}}>
                フォロワーのゲージは Twitch 連携（<code>pnpm twitch</code>）を起動しているときだけ出ます。Twitch でフォロワー目標を設定していればそちらを優先します。
            </Typography>
        </>
    );
};

/** 準備の画面のサイドパネルのカード（固定枠・ローテーション枠・切り替えの秒数・フォロワー目標）。変更はその場で保存する */
const SidePanelSettingsPanel: React.FC<{state: SidePanelSettingsState}> = ({state}) => (
    <LiveCard icon={ViewSidebarRoundedIcon} title="サイドパネル">
        {state.error && <Alert severity="error" sx={{mb: 3}}>{state.error}</Alert>}
        {state.settings
            ? <SidePanelForm settings={state.settings} update={state.update}/>
            : !state.error && <Typography sx={{color: 'text.secondary'}}>読み込み中...</Typography>}
    </LiveCard>
);

export default SidePanelSettingsPanel;
