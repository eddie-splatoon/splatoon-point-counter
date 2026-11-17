'use client';

import ChecklistRoundedIcon from '@mui/icons-material/ChecklistRounded';
import {Alert, Box, Typography} from '@mui/material';
import axios from 'axios';
import React, {useCallback, useEffect, useRef, useState} from 'react';

import {tokens} from '../app/control-panel/theme';
import {Challenge, SidePanelSettings} from '../lib/sidePanelTypes';

import LiveCard, {LiveCardNote} from './LiveCard';

/**
 * 配信中の画面の本日のお題。達成のチェックだけ（追加・削除は準備の画面のサイドパネルのカード）。
 * お題はサイドパネルの設定に含めて丸ごと保存するので、チェックのたびに最新の設定を読み直してから、そのお題の done だけを変えて送る
 * （準備の画面で変えたほかの設定を、開いたときの古い値で戻さないため）
 */
// 準備の画面でお題を変えたのを見せる間隔
const POLL_INTERVAL_MS = 5000;

const ChallengeChecklistCard: React.FC = () => {
    const [challenges, setChallenges] = useState<Challenge[] | null>(null);
    const [error, setError] = useState('');
    // 保存は 1 つずつ順に送る（続けて押したとき、前の保存を後の保存で戻さないため）
    const queue = useRef<Promise<void>>(Promise.resolve());
    // 送っていない・送っている途中のチェックの数と、これまでに押した回数
    const saving = useRef(0);
    const toggles = useRef(0);

    const load = useCallback(async () => {
        const settings = (await axios.get<SidePanelSettings>('/api/side-panel')).data;
        setChallenges(settings.challenges);
        return settings;
    }, []);

    useEffect(() => {
        // マウント時に API からお題を読み込む（ほかのカードと同じパターン）
        // eslint-disable-next-line react-hooks/set-state-in-effect
        load().catch(() => setError('本日のお題を読み込めませんでした。サーバーを確認してください。'));
        // 準備の画面で足したり消したりしたお題を見せるため、定期的に読み込み直す（失敗は次でやり直す）
        // 保存中に読んだ値でチェックを戻さないよう、保存が無いあいだに始まって終わったときだけ使う
        const timer = setInterval(async () => {
            if (saving.current > 0) return;
            const startedAt = toggles.current;
            try {
                const latest = (await axios.get<SidePanelSettings>('/api/side-panel')).data;
                if (saving.current === 0 && toggles.current === startedAt) setChallenges(latest.challenges);
            } catch {
                // 一時的な失敗は次の読み込みでやり直す
            }
        }, POLL_INTERVAL_MS);
        return () => clearInterval(timer);
    }, [load]);

    const toggle = (id: number, done: boolean) => {
        setChallenges((current) => current?.map((c) => (c.id === id ? {...c, done} : c)) ?? null);
        setError('');
        saving.current += 1;
        toggles.current += 1;
        queue.current = queue.current.then(async () => {
            try {
                const latest = (await axios.get<SidePanelSettings>('/api/side-panel')).data;
                const next = {...latest, challenges: latest.challenges.map((c) => (c.id === id ? {...c, done} : c))};
                await axios.post('/api/side-panel', next);
                // 準備の画面で足したり消したりしたお題も、ここで画面に合わせる（後に押したチェックが残っていれば、その保存で合わせる）
                if (saving.current === 1) setChallenges(next.challenges);
            } catch {
                setError('お題の達成を保存できませんでした。');
                await load().catch(() => undefined);
            } finally {
                saving.current -= 1;
            }
        });
    };

    const doneCount = challenges?.filter((c) => c.done).length ?? 0;

    return (
        <LiveCard
            icon={ChecklistRoundedIcon}
            title="本日のお題"
            aside={challenges && challenges.length > 0 && <LiveCardNote>{doneCount} / {challenges.length} 達成</LiveCardNote>}
        >
            {error && <Alert severity="error" sx={{mb: 2}}>{error}</Alert>}
            {challenges?.length === 0 && (
                <Typography variant="body2" sx={{color: 'text.secondary'}}>お題がありません（準備の画面で追加できます）</Typography>
            )}
            {challenges?.map((challenge) => (
                <Box
                    component="label"
                    key={challenge.id}
                    sx={{display: 'flex', alignItems: 'center', gap: 3, minHeight: 48, borderTop: '1px solid #232832', cursor: 'pointer'}}
                >
                    <Box
                        component="input"
                        type="checkbox"
                        checked={challenge.done}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => toggle(challenge.id, e.target.checked)}
                        sx={{width: 22, height: 22, m: 0, flex: 'none', accentColor: tokens.color.success}}
                    />
                    <Typography component="span" sx={{fontSize: 15, whiteSpace: 'pre-line', color: challenge.done ? 'text.secondary' : 'text.primary'}}>
                        {challenge.text}
                    </Typography>
                </Box>
            ))}
        </LiveCard>
    );
};

export default ChallengeChecklistCard;
