'use client';

import EditIcon from '@mui/icons-material/Edit';
import EditNoteRoundedIcon from '@mui/icons-material/EditNoteRounded';
import FileDownloadRoundedIcon from '@mui/icons-material/FileDownloadRounded';
import SetMealRoundedIcon from '@mui/icons-material/SetMealRounded';
import {Alert, Box, Button, ButtonBase, Chip, IconButton, Typography} from '@mui/material';
import axios from 'axios';
import React, {useCallback, useEffect, useState} from 'react';

import {tokens} from '../app/control-panel/theme';
import {SalmonImportRequest} from '../lib/salmonImportTypes';
import {SalmonScheduleData, pickCurrentSchedule} from '../lib/salmonSchedule';
import {SalmonJob, SalmonJobKind, SalmonSummary} from '../lib/salmonTypes';

import {CompactRest, useInCompactLive} from './compactLayout';
import LiveCard from './LiveCard';
import LiveDialog from './LiveDialog';
import SalmonJobDialog, {EditingJob} from './SalmonJobDialog';
import {JobRow, formatTime, jobResultLabel, salmonListSx} from './SalmonJobRow';

const IMPORT_POLL_INTERVAL_MS = 1000;
// カードに出す、このセッションの新しい記録の数
const RECENT_JOBS = 3;
// コンパクト表示（幅 600px 未満）の取り込み・手入力のボタンの高さ
const COMPACT_BUTTON_HEIGHT = 56;

const isActiveImport = (request: SalmonImportRequest | null) => request?.status === 'pending' || request?.status === 'processing';

const importStatusText = (request: SalmonImportRequest): string => {
    switch (request.status) {
        case 'pending':
            return '取り込みスクリプトを待っています...';
        case 'processing':
            return 'イカリング3から読み取り中...（新しいリザルトの反映を待ったり、取りこぼしを遡ったりすることがあります）';
        case 'succeeded':
            return request.recordedCount > 1
                ? `取りこぼしを含めて ${request.recordedCount} 件記録しました（最新は ${request.playedAt} のバイト）`
                : `記録しました（${request.playedAt} のバイト）`;
        case 'failed':
            return `取り込めませんでした: ${request.error ?? '不明なエラー'}`;
    }
};

/** 最後に成功した取り込みと、途中の取り込み（画面を開き直した・幅が変わってカードを作り直したときに、進み具合を出し続けるため） */
const loadImports = async (): Promise<{latest: SalmonImportRequest | null; active: SalmonImportRequest | null}> => {
    const imports = (await axios.get<{imports?: SalmonImportRequest[]}>('/api/salmon/import')).data.imports ?? [];
    return {
        latest: imports.filter((i) => i.status === 'succeeded').sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))[0] ?? null,
        active: imports.filter(isActiveImport).sort((a, b) => b.id - a.id)[0] ?? null,
    };
};

/** 「最後の取り込み 20:47（30 バイト目）」。何バイト目かは、今のセッションの記録にあるときだけ */
const lastImportText = (latest: SalmonImportRequest | null, jobs: SalmonJob[]): string => {
    if (!latest?.completedAt) return 'まだ取り込んでいません';
    const index = jobs.findIndex((j) => j.id === latest.jobId);
    return `最後の取り込み ${formatTime(latest.completedAt)}${index >= 0 ? `（${jobs.length - index} バイト目）` : ''}`;
};

const StatTile: React.FC<{label: string; color: string; value: React.ReactNode; last: string}> = ({label, color, value, last}) => (
    <Box sx={{bgcolor: 'background.default', borderRadius: `${tokens.radius.control}px`, px: 3, py: 2.5, minWidth: 0}}>
        <Typography sx={{color, fontSize: 12, fontWeight: 600}}>{label}</Typography>
        <Typography sx={{fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums', lineHeight: 1.3}}>{value}</Typography>
        <Typography sx={{color: 'text.secondary', fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>前回 {last}</Typography>
    </Box>
);

/**
 * 配信中の画面のサーモンランのカード。取り込み（大きいボタン）・手入力（ダイアログ）・本日の戦績・このセッションの新しい記録。
 * すべての記録の修正・削除はダイアログで開く。セッションの開始は準備、過去のセッションと振り返りの画像は振り返りの画面
 */
const SalmonRunPanel: React.FC = () => {
    const [summary, setSummary] = useState<SalmonSummary | null>(null);
    const [error, setError] = useState('');
    const [request, setRequest] = useState<SalmonImportRequest | null>(null);
    const [latestImport, setLatestImport] = useState<SalmonImportRequest | null>(null);
    // 手入力のダイアログ。editing が null なら新しく記録する
    const [dialog, setDialog] = useState<{editing: EditingJob | null} | null>(null);
    const [allOpen, setAllOpen] = useState(false);
    // 新しく記録するときのステージ・種類。開催中のスケジュールで埋め、記録したらその値を次に引き継ぐ
    const [defaults, setDefaults] = useState<{stage: string; jobKind: SalmonJobKind}>({stage: '', jobKind: 'regular'});

    const load = useCallback(async () => {
        try {
            setSummary((await axios.get<SalmonSummary>('/api/salmon')).data);
        } catch {
            setError('記録の読み込みに失敗しました。サーバーを確認してください。');
        }
    }, []);

    const refreshImports = useCallback(async () => {
        try {
            const {latest, active} = await loadImports();
            setLatestImport(latest);
            // 自分で依頼していなければ、途中の取り込みを引き継いで進み具合を出す
            if (active) setRequest((current) => current ?? active);
        } catch (e) {
            // 「最後の取り込み」は表示の補助なので、取れなくても記録は続けられる
            console.error('Failed to load the salmon imports', e);
        }
    }, []);

    useEffect(() => {
        // マウント時に API から記録・最後の取り込み・開催中のスケジュールを読み込む
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void load();
        void refreshImports();
        axios.get<SalmonScheduleData>('/api/salmon-schedule')
            .then((res) => {
                const current = pickCurrentSchedule(res.data.entries, Date.now());
                if (current) setDefaults((prev) => ({stage: prev.stage || current.stage.name, jobKind: current.kind}));
            })
            // スケジュールは入力の補助なので、取れなくても手入力で記録できる
            .catch((e) => console.error('Failed to load the salmon run schedule', e));
    }, [load, refreshImports]);

    const active = isActiveImport(request);
    const requestId = request?.id;

    useEffect(() => {
        if (!active) return;
        const timer = setInterval(async () => {
            try {
                const res = await axios.get<{imports?: SalmonImportRequest[]}>('/api/salmon/import');
                const latest = res.data.imports?.find((i) => i.id === requestId);
                if (!latest) return;
                setRequest(latest);
                if (latest.status === 'succeeded') {
                    setLatestImport(latest);
                    void load();
                }
            } catch (e) {
                // 一時的な失敗は次のポーリングでやり直す
                console.error('Failed to load the salmon import status', e);
            }
        }, IMPORT_POLL_INTERVAL_MS);
        return () => clearInterval(timer);
    }, [active, requestId, load]);

    const handleImport = async () => {
        setError('');
        try {
            setRequest((await axios.post<{import: SalmonImportRequest}>('/api/salmon/import', {})).data.import);
        } catch {
            setError('取り込みを依頼できませんでした。サーバーを確認してください。');
        }
    };

    const handleDelete = async (id: number) => {
        setError('');
        try {
            setSummary((await axios.delete<SalmonSummary>(`/api/salmon?id=${id}`)).data);
        } catch {
            setError('記録の削除に失敗しました。');
        }
    };

    const openEdit = (job: SalmonJob, index: number) => setDialog({editing: {job, index}});
    const compact = useInCompactLive();

    if (!summary) {
        return (
            <LiveCard icon={SetMealRoundedIcon} title="サーモンラン">
                {error ? <Alert severity="error">{error}</Alert> : <Typography>読み込み中...</Typography>}
            </LiveCard>
        );
    }

    const {session, lastJob, totals, jobs} = summary;

    return (
        <LiveCard
            icon={SetMealRoundedIcon}
            title="サーモンラン"
            hideTitle={compact}
            sx={compact ? {p: 2.5} : undefined}
            aside={(
                <Chip
                    size="small"
                    variant="outlined"
                    label={session ? `#${session.id}${session.title ? ` ${session.title}` : ''}` : 'セッションは最初の記録で作ります'}
                    sx={{maxWidth: '60%', color: 'text.secondary'}}
                />
            )}
        >
            {error && <Alert severity="error" sx={{mb: 2}}>{error}</Alert>}
            <Box sx={{display: 'flex', gap: 2}}>
                <Button
                    variant="contained"
                    color="success"
                    onClick={handleImport}
                    disabled={active}
                    startIcon={<FileDownloadRoundedIcon/>}
                    sx={{flex: '1 1 auto', height: compact ? COMPACT_BUTTON_HEIGHT : tokens.height.hero, borderRadius: `${tokens.radius.primary}px`, fontSize: compact ? 16 : 17}}
                >
                    リザルトを取り込む
                </Button>
                <ButtonBase
                    onClick={() => setDialog({editing: null})}
                    sx={{
                        flex: 'none', flexDirection: 'column', gap: 0.5, width: compact ? 64 : 72, height: compact ? COMPACT_BUTTON_HEIGHT : tokens.height.hero,
                        borderRadius: `${tokens.radius.primary}px`, border: '1px solid', borderColor: 'divider', bgcolor: '#1B1F27',
                        fontSize: 12, fontWeight: 600, '&:hover': {bgcolor: '#222833'},
                        '&.Mui-focusVisible': {outline: `2px solid ${tokens.color.primary}`, outlineOffset: 2},
                    }}
                >
                    <EditNoteRoundedIcon sx={{fontSize: 20}} aria-hidden/>
                    手入力
                </ButtonBase>
            </Box>
            <Typography role="status" variant="caption" sx={{display: 'block', mt: 2, mb: compact ? 1.5 : 3, color: request?.status === 'failed' ? 'error.main' : 'text.secondary'}}>
                {request ? importStatusText(request) : `${lastImportText(latestImport, jobs)} · 取り込めなかったときだけ手入力`}
            </Typography>

            {compact ? (
                // コンパクト表示では、本日の戦績を 1 行にする
                <Typography data-testid="salmon-totals" sx={{display: 'flex', justifyContent: 'space-between', fontSize: 13, fontVariantNumeric: 'tabular-nums'}}>
                    <span><Box component="span" sx={{color: tokens.color.gold}}>金</Box> {totals.goldenEggs.toLocaleString()}</span>
                    <span><Box component="span" sx={{color: '#FF9F6B'}}>オオモノ</Box> {totals.bossKills.toLocaleString()}</span>
                    <span><Box component="span" sx={{color: '#B5BCC8'}}>デス</Box> {totals.deaths.toLocaleString()}</span>
                    <span><Box component="span" sx={{color: tokens.color.success}}>クリア</Box> {totals.clears}/{totals.jobs}</span>
                </Typography>
            ) : (
                <Box data-testid="salmon-totals" sx={{display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 2}}>
                    <StatTile label="金イクラ" color={tokens.color.gold} value={totals.goldenEggs.toLocaleString()} last={lastJob ? String(lastJob.goldenEggs) : '-'}/>
                    <StatTile label="オオモノ" color="#FF9F6B" value={totals.bossKills.toLocaleString()} last={lastJob ? String(lastJob.bossKills) : '-'}/>
                    <StatTile label="デス" color="#B5BCC8" value={totals.deaths.toLocaleString()} last={lastJob ? String(lastJob.deaths) : '-'}/>
                    <StatTile
                        label="クリア"
                        color={tokens.color.success}
                        value={<>{totals.clears}<Box component="span" sx={{fontSize: 13, color: 'text.secondary', fontWeight: 500}}> / {totals.jobs}</Box></>}
                        last={lastJob ? jobResultLabel(lastJob) : '-'}
                    />
                </Box>
            )}

            {/* 記録の一覧は、コンパクト表示では最後の折りたたみに入れる */}
            <CompactRest slot="salmon">
                <Box>
                    {/* コンパクト表示では、折りたたみの置き場の見出し（サーモンランの記録）があるので出さない */}
                    {!compact && <Typography component="h3" sx={{mt: 4, mb: 1.5, fontSize: 12, fontWeight: 600, color: 'text.secondary'}}>このセッションの記録</Typography>}
                    {jobs.length === 0 ? (
                        <Typography variant="body2" sx={{color: 'text.secondary'}}>記録がありません</Typography>
                    ) : (
                        <Box component="ul" data-testid="salmon-recent" sx={{listStyle: 'none', m: 0, p: 0}}>
                            {jobs.slice(0, RECENT_JOBS).map((job, i) => {
                                const index = jobs.length - i;
                                return (
                                    <Box component="li" key={job.id} sx={{display: 'flex', alignItems: 'center', gap: 2.5, py: 1, borderTop: '1px solid #232832'}}>
                                        <Typography sx={{width: 28, color: 'text.secondary', fontVariantNumeric: 'tabular-nums'}}>{index}</Typography>
                                        <Box
                                            component="span"
                                            sx={{
                                                px: 2, borderRadius: `${tokens.radius.badge}px`, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
                                                bgcolor: job.cleared ? tokens.color.successSoft : tokens.color.warningSoft, color: job.cleared ? '#7FE3B0' : '#FFC977',
                                            }}
                                        >
                                            {jobResultLabel(job)}
                                        </Box>
                                        <Typography sx={{flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums'}}>
                                            金 {job.goldenEggs} · オオモノ {job.bossKills} · デス {job.deaths}
                                        </Typography>
                                        <Typography variant="caption" sx={{color: 'text.secondary', fontVariantNumeric: 'tabular-nums'}}>{formatTime(job.createdAt)}</Typography>
                                        <IconButton size="small" onClick={() => openEdit(job, index)} aria-label={`記録 ${index} を修正`}>
                                            <EditIcon fontSize="small"/>
                                        </IconButton>
                                    </Box>
                                );
                            })}
                        </Box>
                    )}
                    {jobs.length > 0 && (
                        <Button size="small" onClick={() => setAllOpen(true)} sx={{mt: 1, minHeight: 32, color: '#FF7AA8'}}>
                            すべての記録（{jobs.length}）と修正・削除
                        </Button>
                    )}
                </Box>
            </CompactRest>

            <LiveDialog open={allOpen} onClose={() => setAllOpen(false)} title={`このセッションの記録（${jobs.length}）`} maxWidth="md">
                <Box data-testid="salmon-history" sx={salmonListSx}>
                    {jobs.length === 0 ? (
                        <Typography variant="body2" sx={{color: 'text.secondary', p: 1}}>記録がありません</Typography>
                    ) : (
                        jobs.map((job, i) => (
                            <JobRow key={job.id} job={job} index={jobs.length - i} onEdit={openEdit} onDelete={handleDelete}/>
                        ))
                    )}
                </Box>
                <Typography variant="caption" sx={{display: 'block', mt: 2, color: 'text.secondary'}}>
                    取り込みの読み間違いは、削除して手入力し直すのではなく ✏️ で修正してください（削除すると次の取り込みで同じバイトがもう一度記録されます）。
                </Typography>
            </LiveDialog>

            {dialog && (
                <SalmonJobDialog
                    editing={dialog.editing}
                    defaults={defaults}
                    onClose={() => setDialog(null)}
                    onSaved={(next, job) => {
                        setSummary(next);
                        if (!dialog.editing) setDefaults({stage: job.stage, jobKind: job.jobKind ?? defaults.jobKind});
                        setDialog(null);
                    }}
                />
            )}
        </LiveCard>
    );
};

export default SalmonRunPanel;
