import EditIcon from '@mui/icons-material/Edit';
import RemoveCircleIcon from '@mui/icons-material/RemoveCircle';
import {Box, IconButton, Typography} from '@mui/material';
import React from 'react';

import {SalmonJob} from '../lib/salmonTypes';
import {findSalmonWeapon} from '../lib/salmonWeapons';

import WeaponIcon from './WeaponIcon';

// サーモンランの記録の行と、セッションの表記（配信中・準備・振り返りの画面で共通）

export const formatDateTime = (timestamp: number) =>
    new Date(timestamp).toLocaleString('ja-JP', {month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false});

export const formatTime = (timestamp: number) =>
    new Date(timestamp).toLocaleTimeString('ja-JP', {hour: '2-digit', minute: '2-digit', hour12: false});

export const sessionLabel = (session: {id: number; startedAt: number; title: string}) =>
    `#${session.id} ${formatDateTime(session.startedAt)}${session.title ? ` ${session.title}` : ''}`;

export const jobResultLabel = (job: SalmonJob) => (job.cleared ? 'クリア' : `WAVE${job.waveReached} 失敗`);

export const salmonListSx = {maxHeight: 360, overflowY: 'auto', p: 1, bgcolor: 'rgba(255, 255, 255, 0.03)', borderRadius: '4px'} as const;

/** 記録の一覧の 1 行（すべての記録・過去のセッション）。onEdit / onDelete を渡すと修正・削除のボタンを出す */
export const JobRow: React.FC<{job: SalmonJob; index: number; onEdit?: (job: SalmonJob, index: number) => void; onDelete?: (id: number) => void}> = ({job, index, onEdit, onDelete}) => (
    <Box sx={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 0.5, borderBottom: '1px dotted rgba(255,255,255,0.2)'}}>
        <Typography variant="body2">
            {index} | {jobResultLabel(job)} | 金イクラ {job.goldenEggs} / オオモノ {job.bossKills} / デス {job.deaths}
            {job.stage && ` | ${job.stage}`} | {formatDateTime(job.createdAt)}
        </Typography>
        <Box sx={{display: 'flex', ml: 'auto', mr: 1}}>
            {job.weapons.map((key, i) => {
                const weapon = findSalmonWeapon(key);
                return weapon && <WeaponIcon key={i} weapon={weapon} size={24}/>;
            })}
        </Box>
        {onEdit && (
            <IconButton size="small" onClick={() => onEdit(job, index)} aria-label={`記録 ${index} を修正`}>
                <EditIcon fontSize="small"/>
            </IconButton>
        )}
        {onDelete && (
            <IconButton size="small" color="error" onClick={() => onDelete(job.id)} aria-label={`記録 ${index} を削除`}>
                <RemoveCircleIcon fontSize="small"/>
            </IconButton>
        )}
    </Box>
);
