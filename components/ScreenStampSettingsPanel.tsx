'use client';

import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded';
import EmojiEmotionsRoundedIcon from '@mui/icons-material/EmojiEmotionsRounded';
import QueryStatsRoundedIcon from '@mui/icons-material/QueryStatsRounded';
import {
    Alert,
    Box,
    Button,
    FormControlLabel,
    IconButton,
    Paper,
    Switch,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    TextField,
    Typography,
} from '@mui/material';
import axios from 'axios';
import React, {useCallback, useEffect, useRef, useState} from 'react';

import {
    parseScreenStampSettings,
    SCREEN_STAMP_GLOBAL_INTERVAL_MS,
    SCREEN_STAMP_LABEL_MAX_LENGTH,
    SCREEN_STAMP_MAX_EMOTES,
    SCREEN_STAMP_MAX_STAMPS,
    SCREEN_STAMP_MAX_WORDS,
    SCREEN_STAMP_SAME_INTERVAL_MS,
    SCREEN_STAMP_STATS_DAYS,
    ScreenStampSettings,
    ScreenStampWindowStats,
    splitStampWords,
} from '../lib/screenStampTypes';

import {useSaveStatus} from './controlPanelContext';
import SectionTitle from './SectionTitle';

// 入力欄の文字（言葉・スタンプの名前は読点区切りで 1 つの欄に入れる）
interface StampDraft {
    id: string;
    label: string;
    words: string;
    emotes: string;
    imageUrl: string;
}

interface Draft {
    enabled: boolean;
    stamps: StampDraft[];
}

const toDraft = (settings: ScreenStampSettings): Draft => ({
    enabled: settings.enabled,
    stamps: settings.stamps.map((s) => ({id: s.id, label: s.label, words: s.words.join('、'), emotes: s.emotes.join('、'), imageUrl: s.imageUrl ?? ''})),
});

const isBlank = (s: StampDraft) => [s.label, s.words, s.emotes, s.imageUrl].every((v) => v.trim() === '');

// 足したばかりで何も入れていないスタンプは保存しない（ほかの編集やスイッチの保存を止めないように）
const fromDraft = (draft: Draft): ScreenStampSettings | null => parseScreenStampSettings({
    enabled: draft.enabled,
    stamps: draft.stamps.filter((s) => !isBlank(s)).map((s) => ({
        id: s.id, label: s.label, words: splitStampWords(s.words), emotes: splitStampWords(s.emotes), imageUrl: s.imageUrl.trim() || null,
    })),
});

const seconds = (ms: number) => ms / 1000;

/**
 * 設定の「画面スタンプ」。チャットでその言葉だけ書かれたとき・「!ナイス」の形・設定したフォロワースタンプを使ったときに、
 * 配信画面に出すスタンプを編集する。文字の欄は入力欄から離れたら（Enter でも）、スイッチ・追加・削除はすぐ保存する
 */
const ScreenStampSettingsPanel: React.FC = () => {
    const [draft, setDraft] = useState<Draft | null>(null);
    const [error, setError] = useState('');
    const {report} = useSaveStatus();
    // 最後に保存した（読み込んだ）設定。変わらない保存は送らない
    const savedRef = useRef('');
    // 保存は 1 つずつ順に送る
    const saveQueue = useRef<Promise<void>>(Promise.resolve());

    const load = useCallback(async () => {
        try {
            const settings = (await axios.get<ScreenStampSettings>('/api/screen-stamp?view=settings')).data;
            savedRef.current = JSON.stringify(settings);
            setDraft(toDraft(settings));
        } catch {
            setError('画面スタンプの設定の読み込みに失敗しました。サーバーを確認してください。');
        }
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void load();
    }, [load]);

    const save = (next: Draft) => {
        const settings = fromDraft(next);
        if (!settings) {
            setError(`保存できない入力があります。ラベルは ${SCREEN_STAMP_LABEL_MAX_LENGTH} 文字まで・言葉は ${SCREEN_STAMP_MAX_WORDS} 個まで、`
                + `フォロワースタンプの名前は英数字で ${SCREEN_STAMP_MAX_EMOTES} 個まで（ほかのスタンプと重ねない）、画像は https:// か / から始まる URL にしてください。`);
            return;
        }
        setError('');
        const body = JSON.stringify(settings);
        if (body === savedRef.current) return;
        savedRef.current = body;
        saveQueue.current = saveQueue.current.then(async () => {
            try {
                await axios.put('/api/screen-stamp', {settings});
                report(true);
            } catch {
                report(false);
                setError('画面スタンプの設定を保存できませんでした。');
                await load();
            }
        });
    };

    if (!draft) {
        return error ? <Alert severity="error">{error}</Alert> : <Typography>読み込み中...</Typography>;
    }

    const updateStamp = (index: number, delta: Partial<StampDraft>) =>
        setDraft({...draft, stamps: draft.stamps.map((s, i) => (i === index ? {...s, ...delta} : s))});
    const change = (next: Draft) => {
        setDraft(next);
        save(next);
    };
    // 足しただけでは保存しない（何か入れて打ち終えたときに保存する）
    const addStamp = () => setDraft({...draft, stamps: [...draft.stamps, {id: `stamp-${Date.now()}`, label: '', words: '', emotes: '', imageUrl: ''}]});
    // 打ち終えたとき（離れた・Enter）に保存する。新しく足したスタンプはラベルを入れるまで保存できない
    const commitOnEnter = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) save(draft);
    };

    return (
        <Paper sx={{mb: 4, p: 4}}>
            <SectionTitle icon={EmojiEmotionsRoundedIcon}>画面スタンプ</SectionTitle>
            <Typography variant="body2" sx={{mb: 2, color: 'text.secondary'}}>
                チャットでメッセージ全体がその言葉だけのとき（「ナイス！」「ないすぅ」なども）・「!ナイス」の形・下のフォロワースタンプを使ったときに、
                配信画面（/screen-stamp-overlay）に 2 秒出します。「ナイスじゃない」のような文の一部では出しません。
                同じスタンプは {seconds(SCREEN_STAMP_SAME_INTERVAL_MS)} 秒、どのスタンプも {seconds(SCREEN_STAMP_GLOBAL_INTERVAL_MS)} 秒に 1 回までです。
            </Typography>
            {error && <Alert severity="error" sx={{mb: 2}}>{error}</Alert>}
            <FormControlLabel
                label="画面スタンプを出す"
                control={<Switch checked={draft.enabled} onChange={(e) => change({...draft, enabled: e.target.checked})}/>}
            />
            <Box component="ul" aria-label="スタンプの一覧" sx={{listStyle: 'none', m: 0, p: 0}}>
                {draft.stamps.map((stamp, index) => (
                    <Box
                        component="li"
                        key={stamp.id}
                        aria-label={stamp.label || '新しいスタンプ'}
                        sx={{display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'flex-start', py: 3, borderTop: 1, borderColor: 'divider'}}
                    >
                        <TextField
                            label="出す文字"
                            size="small"
                            value={stamp.label}
                            onChange={(e) => updateStamp(index, {label: e.target.value})}
                            onBlur={() => save(draft)}
                            onKeyDown={commitOnEnter}
                            sx={{flex: '0 1 140px'}}
                        />
                        <TextField
                            label="言葉（、で区切る）"
                            size="small"
                            value={stamp.words}
                            onChange={(e) => updateStamp(index, {words: e.target.value})}
                            onBlur={() => save(draft)}
                            onKeyDown={commitOnEnter}
                            helperText="出す文字もそのまま言葉になります。ひらがな・カタカナ・全角は区別しません"
                            sx={{flex: '1 1 240px'}}
                        />
                        <TextField
                            label="フォロワースタンプの名前（、で区切る）"
                            size="small"
                            value={stamp.emotes}
                            onChange={(e) => updateStamp(index, {emotes: e.target.value})}
                            onBlur={() => save(draft)}
                            onKeyDown={commitOnEnter}
                            placeholder="eddiesp2Nice"
                            helperText="スタンプを描き直して名前が変わったら、ここを直します"
                            sx={{flex: '1 1 240px'}}
                        />
                        <TextField
                            label="画像の URL（空なら文字で出す）"
                            size="small"
                            value={stamp.imageUrl}
                            onChange={(e) => updateStamp(index, {imageUrl: e.target.value})}
                            onBlur={() => save(draft)}
                            onKeyDown={commitOnEnter}
                            placeholder="/stamps/nice.png"
                            sx={{flex: '1 1 240px'}}
                        />
                        <IconButton
                            aria-label={`${stamp.label || '新しいスタンプ'}を削除`}
                            onClick={() => change({...draft, stamps: draft.stamps.filter((_, i) => i !== index)})}
                        >
                            <DeleteRoundedIcon/>
                        </IconButton>
                    </Box>
                ))}
            </Box>
            <Button startIcon={<AddRoundedIcon/>} onClick={addStamp} disabled={draft.stamps.length >= SCREEN_STAMP_MAX_STAMPS}>
                スタンプを追加
            </Button>
        </Paper>
    );
};

const formatDateTime = (at: number) => new Date(at).toLocaleString('ja-JP', {month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'});
const formatTime = (at: number) => new Date(at).toLocaleTimeString('ja-JP', {hour: '2-digit', minute: '2-digit'});

/** 振り返りの画面の「画面スタンプ」。配信ごとに、スタンプごとの表示回数と出した人の数（名前は残していない） */
export const ScreenStampHistoryCard: React.FC = () => {
    const [windows, setWindows] = useState<ScreenStampWindowStats[] | null>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        axios.get<{windows: ScreenStampWindowStats[]}>('/api/screen-stamp?view=stats').then(
            (res) => setWindows(res.data.windows),
            () => setError('画面スタンプの集計を読み込めませんでした。'),
        );
    }, []);

    return (
        <Paper sx={{mb: 4, p: 4}}>
            <SectionTitle icon={QueryStatsRoundedIcon}>画面スタンプ（{SCREEN_STAMP_STATS_DAYS} 日）</SectionTitle>
            {error && <Alert severity="error" sx={{mb: 2}}>{error}</Alert>}
            <Typography variant="body2" sx={{mb: 1, color: 'text.secondary'}}>
                配信ごとに、出した回数と出した人の数だけを残します（誰が出したかは残しません）。配信の終了で区切ります。
            </Typography>
            {windows && (windows.length === 0 ? (
                <Typography variant="body2" sx={{color: 'text.secondary'}}>まだありません。</Typography>
            ) : (
                <Table size="small" aria-label="画面スタンプの集計">
                    <TableHead>
                        <TableRow>
                            <TableCell>配信</TableCell>
                            <TableCell>スタンプ</TableCell>
                            <TableCell align="right">回数</TableCell>
                            <TableCell align="right">人数</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {windows.flatMap((w) => [...w.stamps].sort((a, b) => b.shown - a.shown).map((s, i) => (
                            <TableRow key={`${w.startedAt}-${s.id}`}>
                                <TableCell>{i === 0 && `${formatDateTime(w.startedAt)}〜${w.endedAt === null ? '配信中' : formatTime(w.endedAt)}`}</TableCell>
                                <TableCell>{s.label}</TableCell>
                                <TableCell align="right">{s.shown}</TableCell>
                                <TableCell align="right">{s.users}</TableCell>
                            </TableRow>
                        )))}
                    </TableBody>
                </Table>
            ))}
        </Paper>
    );
};

export default ScreenStampSettingsPanel;
