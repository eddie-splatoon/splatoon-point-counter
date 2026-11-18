'use client';

import CampaignRoundedIcon from '@mui/icons-material/CampaignRounded';
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import DragIndicatorRoundedIcon from '@mui/icons-material/DragIndicatorRounded';
import ListAltRoundedIcon from '@mui/icons-material/ListAltRounded';
import SubtitlesOutlinedIcon from '@mui/icons-material/SubtitlesOutlined';
import TextFieldsRoundedIcon from '@mui/icons-material/TextFieldsRounded';
import VolumeUpRoundedIcon from '@mui/icons-material/VolumeUpRounded';
import {Alert, Box, Button, Checkbox, FormControlLabel, IconButton, TextField, Typography} from '@mui/material';
import axios from 'axios';
import React, {useCallback, useEffect, useRef, useState} from 'react';

import {monoFontFamily, tokens} from '../app/control-panel/theme';
import {
    MAX_TELOP_LENGTH,
    MAX_TELOP_PRESETS,
    TelopData,
    TelopPreset,
    normalizeTelopText,
} from '../lib/telopTypes';

import LiveCard, {LiveCardNote} from './LiveCard';

import type {SvgIconComponent} from '@mui/icons-material';

// 文を打ち終えてから保存するまでの待ち時間（入力欄から離れたときと Enter ではすぐ保存する）
const TEXT_SAVE_DELAY_MS = 500;
// 数字キーが割り当てられるプリセットの数（1〜9, 0）
const HOTKEY_COUNT = 10;

type ToggleKey = 'display' | 'chat' | 'speak' | 'followFont';

// アイコンのトグル。並び・色は設計書 6 章（テロップに出す・チャットにコメント・読み上げ・共通フォント）
const TOGGLES: {key: ToggleKey; label: string; icon: SvgIconComponent; ariaLabel: (text: string) => string; on: {border: string; background: string; color: string}}[] = [
    {key: 'display', label: 'テロップに出す', icon: SubtitlesOutlinedIcon, ariaLabel: (t) => `「${t}」を配信画面のテロップに出す`, on: {border: '#5B3346', background: tokens.color.primarySoft, color: '#FF9CC0'}},
    {key: 'chat', label: 'チャットにコメント', icon: ChatBubbleOutlineRoundedIcon, ariaLabel: (t) => `「${t}」を Twitch のチャットにも書き込む`, on: {border: '#2C4A6B', background: '#132235', color: '#9FD8FF'}},
    {key: 'speak', label: '読み上げ', icon: VolumeUpRoundedIcon, ariaLabel: (t) => `「${t}」を読み上げる`, on: {border: '#2F6B4A', background: tokens.color.successSoft, color: '#7FE3B0'}},
    {key: 'followFont', label: '共通フォント', icon: TextFieldsRoundedIcon, ariaLabel: (t) => `「${t}」を共通設定のフォントで表示`, on: {border: '#6B5530', background: tokens.color.warningSoft, color: '#FFC977'}},
];

/** 番号のバッジの文字（先頭 10 個は数字キー 1〜9, 0） */
export const presetKeyLabel = (index: number) => (index < HOTKEY_COUNT ? String((index + 1) % 10) : String(index + 1));

const move = <T, >(list: T[], from: number, to: number) => {
    const next = [...list];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
};

/** プリセットの文の入力欄。打ち終えて少し待つか、入力欄から離れる・Enter で保存する（30 文字を超えた・空の文は保存しない） */
const PresetTextInput: React.FC<{preset: TelopPreset; index: number; onCommit: (text: string) => void}> = ({preset, index, onCommit}) => {
    const [draft, setDraft] = useState(preset.text);
    // 保存した・ほかで変わった文に合わせる（打っている途中の文は、保存されるまで preset.text が変わらないので戻さない）
    const [savedText, setSavedText] = useState(preset.text);
    if (savedText !== preset.text) {
        setSavedText(preset.text);
        setDraft(preset.text);
    }
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const commitRef = useRef<() => void>(() => undefined);

    const normalized = normalizeTelopText(draft);
    const commit = () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
        if (normalized !== null && normalized !== preset.text) onCommit(normalized);
    };
    useEffect(() => {
        commitRef.current = commit;
    });
    // 画面を離れるときは、待っている文をすぐ保存する
    useEffect(() => () => {
        if (timer.current) commitRef.current();
    }, []);

    return (
        <TextField
            size="small"
            value={draft}
            onChange={(e) => {
                setDraft(e.target.value);
                if (timer.current) clearTimeout(timer.current);
                timer.current = setTimeout(() => commitRef.current(), TEXT_SAVE_DELAY_MS);
            }}
            onBlur={commit}
            onKeyDown={(e) => {
                if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
                e.preventDefault();
                commit();
            }}
            error={normalized === null}
            helperText={normalized === null ? `空にはできません（${MAX_TELOP_LENGTH} 文字まで）。この文は保存されません` : undefined}
            slotProps={{htmlInput: {'aria-label': `${index + 1} 番目の文`}}}
            sx={{flex: '1 1 240px', minWidth: 0}}
        />
    );
};

const PresetToggle: React.FC<{toggle: typeof TOGGLES[number]; preset: TelopPreset; disabled: boolean; onToggle: () => void}> = ({toggle, preset, disabled, onToggle}) => {
    const pressed = preset[toggle.key];
    const Icon = toggle.icon;
    return (
        <IconButton
            aria-label={toggle.ariaLabel(preset.text)}
            aria-pressed={pressed}
            disabled={disabled}
            onClick={onToggle}
            sx={{
                width: 40, height: 40, borderRadius: `${tokens.radius.control}px`, border: '1px solid',
                borderColor: pressed ? toggle.on.border : '#2E3542',
                bgcolor: pressed ? toggle.on.background : 'transparent',
                color: pressed ? toggle.on.color : '#6B7383',
                '&:hover': {bgcolor: pressed ? toggle.on.background : tokens.color.surface2},
                // 外せない ON（テロップとチャットの最後の 1 つ）は、OFF に見えないよう色を残す
                '&.Mui-disabled': {borderColor: pressed ? toggle.on.border : '#2E3542', color: pressed ? toggle.on.color : '#6B7383', opacity: pressed ? 1 : 0.5, cursor: 'not-allowed', pointerEvents: 'auto'},
            }}
        >
            <Icon sx={{fontSize: 18}}/>
        </IconButton>
    );
};

interface TelopPanelProps {
    /** プリセットを保存（または保存に失敗して読み込み直）したとき。配信中の画面のボタンと数字キーに反映するのに使う */
    onPresetsChange?: () => void;
}

/**
 * 設定の「テロップのプリセット」。自由入力でテロップを出し、プリセットを 1 行ずつ編集する（変更はその場で保存される。設計書 6 章）。
 * プリセットのボタンは配信中の画面の TelopBar、キーボードの 1〜9, 0 は共通の外枠（どの画面でも効く）にある
 */
const TelopPanel: React.FC<TelopPanelProps> = ({onPresetsChange}) => {
    const [presets, setPresets] = useState<TelopPreset[] | null>(null);
    const [freeText, setFreeText] = useState('');
    const [freeTextFollowFont, setFreeTextFollowFont] = useState(true);
    const [freeTextSpeak, setFreeTextSpeak] = useState(false);
    const [newPreset, setNewPreset] = useState('');
    const [dragging, setDragging] = useState<number | null>(null);
    const [error, setError] = useState('');
    // 文の保存は少し遅れて呼ばれるので、そのときの最新のプリセットに重ねる
    const presetsRef = useRef<TelopPreset[] | null>(null);
    // プリセットの保存は1件ずつ順に送る（並行して送ると、後の変更より先の変更が後に届いて残ることがある）
    const saveQueue = useRef<Promise<void>>(Promise.resolve());

    const load = useCallback(async () => {
        try {
            const res = await axios.get<TelopData>('/api/telop');
            presetsRef.current = res.data.presets;
            setPresets(res.data.presets);
        } catch {
            setError('テロップの設定の読み込みに失敗しました。サーバーを確認してください。');
        }
    }, []);

    useEffect(() => {
        // マウント時に API から設定を読み込む（ほかのカードと同じパターン）
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void load();
    }, [load]);

    /** 自由入力のテロップを出す。出せたかを返す */
    const show = useCallback(async (body: {text: string; followFont: boolean; speak: boolean}): Promise<boolean> => {
        setError('');
        try {
            await axios.post('/api/telop', body);
            return true;
        } catch {
            setError('テロップを出せませんでした。');
            return false;
        }
    }, []);

    const savePresets = (change: (current: TelopPreset[]) => TelopPreset[]) => {
        if (!presetsRef.current) return;
        const next = change(presetsRef.current);
        presetsRef.current = next;
        setPresets(next);
        setError('');
        // 表示は送信前に更新しておく。応答で上書きすると、素早い連続操作で古い応答が新しい状態を戻してしまう
        saveQueue.current = saveQueue.current.then(async () => {
            try {
                await axios.put('/api/telop', {presets: next});
            } catch {
                setError('プリセットの保存に失敗しました。');
                await load();
            }
            onPresetsChange?.();
        });
    };

    if (!presets) {
        return error ? <Alert severity="error">{error}</Alert> : <Typography>読み込み中...</Typography>;
    }

    const normalizedFreeText = normalizeTelopText(freeText);
    const handleShowFreeText = async () => {
        if (normalizedFreeText === null) return;
        // 出せなかったときは入力を残して、そのまま再送できるようにする。送信中に打ち直した文は消さない
        const sent = normalizedFreeText;
        if (await show({text: sent, followFont: freeTextFollowFont, speak: freeTextSpeak})) setFreeText((current) => normalizeTelopText(current) === sent ? '' : current);
    };

    const normalizedNewPreset = normalizeTelopText(newPreset);
    const canAddPreset = normalizedNewPreset !== null && presets.length < MAX_TELOP_PRESETS;
    const handleAddPreset = () => {
        if (!canAddPreset) return;
        savePresets((current) => [
            ...current,
            {id: Math.max(0, ...current.map((p) => p.id)) + 1, text: normalizedNewPreset, speak: false, followFont: true, display: true, chat: false},
        ]);
        setNewPreset('');
    };

    const updatePreset = (id: number, delta: Partial<TelopPreset>) =>
        savePresets((current) => current.map((p) => (p.id === id ? {...p, ...delta} : p)));

    const movePreset = (from: number, to: number) => {
        if (to < 0 || to >= presets.length || from === to) return;
        savePresets((current) => move(current, from, to));
    };

    return (
        <Box sx={{display: 'flex', flexDirection: 'column', gap: 4}}>
            {error && <Alert severity="error">{error}</Alert>}

            <LiveCard icon={CampaignRoundedIcon} title="自由入力で出す">
                <Box sx={{display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'flex-start'}}>
                    <TextField
                        size="small"
                        label="自由入力"
                        placeholder="出したい文（入力中は数字キーのテロップは効きません）"
                        value={freeText}
                        onChange={(e) => setFreeText(e.target.value)}
                        // 変換中の Enter では出さない
                        onKeyDown={(e) => {
                            if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
                            e.preventDefault();
                            void handleShowFreeText();
                        }}
                        error={freeText.trim() !== '' && normalizedFreeText === null}
                        helperText={`${MAX_TELOP_LENGTH} 文字まで。Enter で出します。`}
                        sx={{flex: '1 1 280px'}}
                    />
                    <Button variant="contained" onClick={() => void handleShowFreeText()} disabled={normalizedFreeText === null} sx={{height: tokens.height.control, px: 5}}>出す</Button>
                </Box>
                <FormControlLabel
                    label="共通設定のフォントで表示"
                    control={<Checkbox size="small" checked={freeTextFollowFont} onChange={(e) => setFreeTextFollowFont(e.target.checked)}/>}
                />
                <FormControlLabel
                    label="読み上げる"
                    control={<Checkbox size="small" checked={freeTextSpeak} onChange={(e) => setFreeTextSpeak(e.target.checked)}/>}
                />
            </LiveCard>

            <LiveCard
                icon={ListAltRoundedIcon}
                title="テロップのプリセット"
                aside={<LiveCardNote>{presets.length} / {MAX_TELOP_PRESETS} · 先頭の 10 個が数字キー 1〜0 になります</LiveCardNote>}
            >
                <Box aria-label="アイコンの意味" component="ul" sx={{display: 'flex', flexWrap: 'wrap', gap: 3.5, listStyle: 'none', m: 0, p: 0, pb: 2.5, color: 'text.secondary', fontSize: 12}}>
                    {TOGGLES.map(({key, label, icon: Icon}) => (
                        <Box component="li" key={key} sx={{display: 'inline-flex', alignItems: 'center', gap: 1}}>
                            <Icon sx={{fontSize: 14}} aria-hidden/>{label}
                        </Box>
                    ))}
                </Box>
                <Box component="ol" data-testid="telop-preset-editor" sx={{listStyle: 'none', m: 0, p: 0}}>
                    {presets.map((preset, index) => (
                        <Box
                            component="li"
                            key={preset.id}
                            onDragOver={(e: React.DragEvent) => {
                                if (dragging !== null) e.preventDefault();
                            }}
                            onDrop={(e: React.DragEvent) => {
                                e.preventDefault();
                                if (dragging !== null) movePreset(dragging, index);
                                setDragging(null);
                            }}
                            onDragEnd={() => setDragging(null)}
                            sx={{display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, py: 2, borderTop: '1px solid #232832', opacity: dragging === index ? 0.5 : 1}}
                        >
                            {/* つまみをドラッグして並べ替える（行ごとにすると入力欄の文字を選べなくなるので、つまみだけ）。キーボードではつまみにフォーカスして ↑↓ */}
                            <IconButton
                                size="small"
                                draggable
                                onDragStart={(e: React.DragEvent) => {
                                    setDragging(index);
                                    e.dataTransfer.effectAllowed = 'move';
                                }}
                                aria-label={`「${preset.text}」を並べ替える（↑↓ キー）`}
                                onKeyDown={(e) => {
                                    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
                                    e.preventDefault();
                                    movePreset(index, index + (e.key === 'ArrowUp' ? -1 : 1));
                                }}
                                sx={{cursor: 'grab', color: '#6B7383', width: 28}}
                            >
                                <DragIndicatorRoundedIcon fontSize="small"/>
                            </IconButton>
                            <Box
                                component="span"
                                aria-label={index < HOTKEY_COUNT ? `数字キー ${presetKeyLabel(index)}` : `${index + 1} 番目（数字キーなし）`}
                                sx={{
                                    flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26,
                                    borderRadius: '7px', fontFamily: monoFontFamily, fontSize: 12, fontWeight: 700,
                                    bgcolor: index < HOTKEY_COUNT ? tokens.color.primary : tokens.color.surface2,
                                    color: index < HOTKEY_COUNT ? tokens.color.onPrimary : tokens.color.textMuted,
                                }}
                            >
                                {presetKeyLabel(index)}
                            </Box>
                            <PresetTextInput preset={preset} index={index} onCommit={(text) => updatePreset(preset.id, {text})}/>
                            <Box sx={{display: 'flex', gap: 1}}>
                                {TOGGLES.map((toggle) => (
                                    <PresetToggle
                                        key={toggle.key}
                                        toggle={toggle}
                                        preset={preset}
                                        // テロップ・コメントのどちらかは ON にする（両方 OFF だと出しても何も起きない）
                                        disabled={(toggle.key === 'display' && preset.display && !preset.chat) || (toggle.key === 'chat' && preset.chat && !preset.display)}
                                        onToggle={() => updatePreset(preset.id, {[toggle.key]: !preset[toggle.key]})}
                                    />
                                ))}
                                <IconButton
                                    aria-label={`プリセット「${preset.text}」を削除`}
                                    onClick={() => savePresets((current) => current.filter((p) => p.id !== preset.id))}
                                    sx={{width: 40, height: 40, color: 'text.secondary'}}
                                >
                                    <DeleteOutlineRoundedIcon sx={{fontSize: 18}}/>
                                </IconButton>
                            </Box>
                        </Box>
                    ))}
                </Box>
                <Box sx={{display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'flex-start', pt: 3, borderTop: '1px solid #232832'}}>
                    <TextField
                        size="small"
                        label="新しいプリセット"
                        value={newPreset}
                        onChange={(e) => setNewPreset(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
                            e.preventDefault();
                            handleAddPreset();
                        }}
                        error={newPreset.trim() !== '' && normalizedNewPreset === null}
                        helperText={`${MAX_TELOP_LENGTH} 文字まで。Enter で追加できます。`}
                        sx={{flex: '1 1 280px'}}
                    />
                    <Button variant="outlined" onClick={handleAddPreset} disabled={!canAddPreset} sx={{height: tokens.height.control}}>追加</Button>
                </Box>
                <Typography variant="caption" sx={{display: 'block', mt: 2}}>
                    「テロップに出す」と「チャットにコメント」のどちらかは必ず ON にします。「チャットにコメント」は Twitch 連携（<code>pnpm twitch</code>）の起動中だけ書き込み、「読み上げ」も ON なら読み上げはコメントの読み上げに任せます。「共通フォント」を外すと、共通設定のフォントに無い文字が化けないよう既定のフォントで出します。
                </Typography>
            </LiveCard>
        </Box>
    );
};

export default TelopPanel;
