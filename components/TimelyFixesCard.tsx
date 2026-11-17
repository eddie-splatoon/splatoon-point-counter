'use client';

import BuildRoundedIcon from '@mui/icons-material/BuildRounded';
import {Alert, Box, Button, Typography} from '@mui/material';
import React, {useState} from 'react';

import LiveCard from './LiveCard';
import LiveDialog from './LiveDialog';
import {ScoreDisplayEditor, useScoreDisplay} from './ScoreDisplayPanel';
import {WeaponCardManual, useWeaponCard} from './WeaponCardPanel';

// 記録で埋まったマスを見せるため、定期的に読み込み直す
const WEAPON_CARD_POLL_MS = 5000;

const Row: React.FC<{children: React.ReactNode; action: string; onClick: () => void; first?: boolean}> = ({children, action, onClick, first = false}) => (
    <Box sx={{display: 'flex', alignItems: 'center', gap: 2.5, minHeight: 44, borderTop: first ? 'none' : '1px solid #232832'}}>
        <Typography component="div" sx={{flex: '1 1 auto', minWidth: 0, color: '#B5BCC8'}}>{children}</Typography>
        <Button variant="outlined" size="small" onClick={onClick} sx={{minHeight: 32, flex: 'none'}}>{action}</Button>
    </Box>
);

/** 配信中の画面の「ときどき直すもの」（スコア表示・ブキ埋めカード）。直すときはダイアログで開く */
const TimelyFixesCard: React.FC = () => {
    const score = useScoreDisplay();
    const weaponCard = useWeaponCard(WEAPON_CARD_POLL_MS);
    const [open, setOpen] = useState<'score' | 'weapons' | null>(null);
    const close = () => setOpen(null);

    return (
        <LiveCard icon={BuildRoundedIcon} title="ときどき直すもの" hideTitle sx={{py: 2}}>
            <Row first action="直す" onClick={() => setOpen('score')}>
                スコア表示{' '}
                <Box component="strong" data-testid="score-display-value" sx={{color: 'text.primary'}}>{score.saved?.scoreValue ?? '…'}</Box>
                {score.saved?.autoUpdate && <Box component="span" sx={{ml: 1.5, fontSize: 12, color: 'text.secondary'}}>自動</Box>}
            </Row>
            <Row action="埋める・外す" onClick={() => setOpen('weapons')}>
                ブキ埋めカード{' '}
                <Box component="strong" data-testid="weapon-card-summary" sx={{color: 'text.primary', fontVariantNumeric: 'tabular-nums'}}>
                    {weaponCard.card ? `${weaponCard.card.obtained.length} / ${weaponCard.card.total}` : '…'}
                </Box>
            </Row>
            {score.error && !open && <Alert severity="error" sx={{my: 1}}>{score.error}</Alert>}
            {weaponCard.error && !open && <Alert severity="error" sx={{my: 1}}>{weaponCard.error}</Alert>}

            <LiveDialog open={open === 'score'} onClose={close} title="スコア表示を直す" maxWidth="xs">
                <ScoreDisplayEditor {...score} onApplied={close}/>
            </LiveDialog>
            <LiveDialog open={open === 'weapons'} onClose={close} title="ブキ埋めカードを埋める・外す" maxWidth="md">
                <WeaponCardManual {...weaponCard}/>
            </LiveDialog>
        </LiveCard>
    );
};

export default TimelyFixesCard;
