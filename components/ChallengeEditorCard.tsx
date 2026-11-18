'use client';

import ChecklistRoundedIcon from '@mui/icons-material/ChecklistRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import DragIndicatorRoundedIcon from '@mui/icons-material/DragIndicatorRounded';
import {Alert, Box, Button, IconButton, TextField, Typography} from '@mui/material';
import React, {useState} from 'react';

import {tokens} from '../app/control-panel/theme';
import {
    Challenge,
    MAX_CHALLENGES,
    MAX_CHALLENGE_LENGTH,
    MAX_CHALLENGE_LINES,
    SidePanelSettings,
    normalizeChallengeText,
} from '../lib/sidePanelTypes';

import LiveCard, {LiveCardNote} from './LiveCard';
import {SidePanelSettingsState} from './useSidePanelSettings';

const oneLine = (text: string) => text.replace(/\n/g, ' ');

/** order（お題の id の並び）の順に並べ直す。order に無いお題（ほかの画面で足したもの）は後ろに残す */
export const reorderChallenges = (challenges: Challenge[], order: number[]) => {
    const rank = (c: Challenge) => {
        const i = order.indexOf(c.id);
        return i === -1 ? order.length : i;
    };
    return [...challenges].sort((a, b) => rank(a) - rank(b));
};

const move = <T, >(list: T[], from: number, to: number) => {
    const next = [...list];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
};

const ChallengeEditor: React.FC<{settings: SidePanelSettings; update: SidePanelSettingsState['update']}> = ({settings, update}) => {
    const [newChallenge, setNewChallenge] = useState('');
    const [dragging, setDragging] = useState<number | null>(null);
    const {challenges} = settings;

    // 改行は配信画面で折り返したい位置としてそのまま残す（各行の前後の空白と空行は除く）
    const normalized = normalizeChallengeText(newChallenge);
    const canAdd = normalized !== null && challenges.length < MAX_CHALLENGES;

    const handleAdd = () => {
        if (!canAdd) return;
        // id は保存の直前に読み直した最新のお題から振る（ほかの画面で足したお題と重ねない）
        update((latest) => ({
            challenges: [...latest.challenges, {id: Math.max(0, ...latest.challenges.map((c) => c.id)) + 1, text: normalized, done: false}],
        }));
        setNewChallenge('');
    };

    const handleRemove = (id: number) => update((latest) => ({challenges: latest.challenges.filter((c) => c.id !== id)}));

    const handleMove = (from: number, to: number) => {
        if (to < 0 || to >= challenges.length || from === to) return;
        const order = move(challenges, from, to).map((c) => c.id);
        update((latest) => ({challenges: reorderChallenges(latest.challenges, order)}));
    };

    return (
        <>
            {challenges.length === 0 ? (
                <Typography variant="body2" sx={{color: 'text.secondary', mb: 2}}>お題がありません</Typography>
            ) : (
                <Box component="ul" aria-label="本日のお題の一覧" sx={{listStyle: 'none', m: 0, p: 0}}>
                    {challenges.map((challenge, index) => (
                        <Box
                            component="li"
                            key={challenge.id}
                            // つまみをドラッグして並べ替える。キーボードではつまみにフォーカスして ↑↓
                            draggable
                            onDragStart={(e: React.DragEvent) => {
                                setDragging(index);
                                e.dataTransfer.effectAllowed = 'move';
                            }}
                            onDragOver={(e: React.DragEvent) => {
                                if (dragging !== null) e.preventDefault();
                            }}
                            onDrop={(e: React.DragEvent) => {
                                e.preventDefault();
                                if (dragging !== null) handleMove(dragging, index);
                                setDragging(null);
                            }}
                            onDragEnd={() => setDragging(null)}
                            sx={{
                                display: 'flex', alignItems: 'center', gap: 2, minHeight: 44, borderTop: '1px solid #232832',
                                opacity: dragging === index ? 0.5 : 1,
                            }}
                        >
                            <IconButton
                                size="small"
                                aria-label={`「${oneLine(challenge.text)}」を並べ替える（↑↓ キー）`}
                                onKeyDown={(e) => {
                                    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
                                    e.preventDefault();
                                    handleMove(index, index + (e.key === 'ArrowUp' ? -1 : 1));
                                }}
                                sx={{cursor: 'grab', color: '#6B7383'}}
                            >
                                <DragIndicatorRoundedIcon fontSize="small"/>
                            </IconButton>
                            <Typography component="span" sx={{flex: 1, fontSize: 14, whiteSpace: 'pre-line'}}>{challenge.text}</Typography>
                            <IconButton size="small" aria-label={`「${oneLine(challenge.text)}」を消す`} onClick={() => handleRemove(challenge.id)} sx={{color: 'text.secondary'}}>
                                <CloseRoundedIcon fontSize="small"/>
                            </IconButton>
                        </Box>
                    ))}
                </Box>
            )}
            <Box sx={{display: 'flex', gap: 2, alignItems: 'flex-start', mt: 2}}>
                <TextField
                    size="small"
                    label="新しいお題"
                    value={newChallenge}
                    onChange={(e) => setNewChallenge(e.target.value)}
                    // Enter は改行。Ctrl / ⌘ + Enter で追加する（変換中は追加しない。追加時はブラウザが改行を入れないよう止める）
                    onKeyDown={(e) => {
                        if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey) || e.nativeEvent.isComposing) return;
                        e.preventDefault();
                        handleAdd();
                    }}
                    error={newChallenge.trim() !== '' && normalized === null}
                    helperText={`改行の位置で折り返します（${MAX_CHALLENGE_LINES} 行・${MAX_CHALLENGE_LENGTH} 文字まで）。Ctrl / ⌘ + Enter で追加`}
                    multiline
                    maxRows={MAX_CHALLENGE_LINES}
                    fullWidth
                />
                <Button variant="outlined" onClick={handleAdd} disabled={!canAdd} sx={{height: tokens.height.control, flex: 'none'}}>追加</Button>
            </Box>
        </>
    );
};

/** 準備の画面の本日のお題（追加・削除・並べ替え）。達成のチェックは配信中の画面。お題はサイドパネルの設定に含めて保存する */
const ChallengeEditorCard: React.FC<{state: SidePanelSettingsState}> = ({state}) => {
    const count = state.settings?.challenges.length;
    return (
        <LiveCard
            icon={ChecklistRoundedIcon}
            title="本日のお題"
            aside={count !== undefined && <LiveCardNote>{count} / {MAX_CHALLENGES}</LiveCardNote>}
        >
            {state.error && <Alert severity="error" sx={{mb: 3}}>{state.error}</Alert>}
            {state.settings
                ? <ChallengeEditor settings={state.settings} update={state.update}/>
                : !state.error && <Typography sx={{color: 'text.secondary'}}>読み込み中...</Typography>}
        </LiveCard>
    );
};

export default ChallengeEditorCard;
