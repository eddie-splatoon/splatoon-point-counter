'use client';

import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ErrorRoundedIcon from '@mui/icons-material/ErrorRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import {Box, CssBaseline, IconButton, Typography} from '@mui/material';
import {ThemeProvider} from '@mui/material/styles';
import Image from 'next/image';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import React from 'react';

import {theme, tokens} from '../app/control-panel/theme';

import {BreakBanner, BreakButton, useBreak} from './BreakControl';
import {SaveStatusProvider, TelopPresetsProvider, useSaveStatus, useTelopPresets} from './controlPanelContext';
import {useTelopHotkeys} from './useTelopHotkeys';

// 配信のフェーズ。/control-panel（配信中）を既定にする（配信中にページを開き直しても 1 手で戻れるように）
export const CONTROL_PANEL_PHASES = [
    {href: '/control-panel/prepare', label: '準備'},
    {href: '/control-panel', label: '配信中'},
    {href: '/control-panel/review', label: '振り返り'},
] as const;

const SaveIndicator: React.FC = () => {
    const {failed} = useSaveStatus();
    return (
        <Box role="status" sx={{display: 'flex', alignItems: 'center', gap: 1, color: failed ? 'error.main' : 'text.secondary'}}>
            {failed
                ? <ErrorRoundedIcon fontSize="small" aria-hidden/>
                : <CheckCircleRoundedIcon fontSize="small" sx={{color: 'success.main'}} aria-hidden/>}
            <Typography variant="caption" sx={{color: 'inherit', fontWeight: failed ? 700 : 400}}>
                {failed ? '保存できませんでした' : '変更はすぐ保存'}
            </Typography>
        </Box>
    );
};

const PhaseSwitch: React.FC = () => {
    const pathname = usePathname();
    return (
        <Box component="nav" aria-label="フェーズ" sx={{display: 'flex', gap: 1, p: 1, borderRadius: `${tokens.radius.pill}px`, bgcolor: tokens.color.surface2}}>
            {CONTROL_PANEL_PHASES.map(({href, label}) => {
                const current = pathname === href;
                return (
                    <Box
                        key={href}
                        component={Link}
                        href={href}
                        aria-current={current ? 'page' : undefined}
                        sx={{
                            px: 4, py: 1.5, borderRadius: `${tokens.radius.pill}px`, fontWeight: 700, fontSize: 14, textDecoration: 'none',
                            color: current ? tokens.color.onPrimary : tokens.color.textMuted,
                            bgcolor: current ? tokens.color.primary : 'transparent',
                            '&:hover': {color: current ? tokens.color.onPrimary : tokens.color.text},
                        }}
                    >
                        {label}
                    </Box>
                );
            })}
        </Box>
    );
};

// テロップの数字キーは、どの画面を開いていても効くよう外枠で 1 回だけ受ける
const TelopHotkeys: React.FC = () => {
    const {presets, show} = useTelopPresets();
    useTelopHotkeys(presets, show);
    return null;
};

const Header: React.FC = () => {
    const breakView = useBreak();
    return (
        <Box sx={{position: 'sticky', top: 0, zIndex: 10}}>
            <Box
                component="header"
                sx={{
                    display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, px: 5, py: 3,
                    bgcolor: tokens.color.header, borderBottom: 1, borderColor: 'divider',
                }}
            >
                <Box sx={{display: 'flex', alignItems: 'center', gap: 2}}>
                    <Image src="/favicon.svg" alt="" width={28} height={28}/>
                    <Typography variant="h1" component="p">配信パネル</Typography>
                </Box>
                <PhaseSwitch/>
                <Box sx={{flex: 1}}/>
                <SaveIndicator/>
                <BreakButton view={breakView}/>
                <IconButton component={Link} href="/control-panel/settings" aria-label="設定">
                    <SettingsRoundedIcon/>
                </IconButton>
            </Box>
            <BreakBanner view={breakView}/>
        </Box>
    );
};

/** コントロールパネルの共通の外枠（テーマ・ヘッダー・休憩の帯・テロップの数字キー・保存の状態） */
// 配信中の画面は 3 列のカードなので広く使う。ほかの画面は読みやすい幅にする
const LIVE_MAX_WIDTH = 1600;
const PAGE_MAX_WIDTH = 900;

const Main: React.FC<{children: React.ReactNode}> = ({children}) => {
    const pathname = usePathname();
    return (
        <Box component="main" sx={{px: 5, py: 4, maxWidth: pathname === '/control-panel' ? LIVE_MAX_WIDTH : PAGE_MAX_WIDTH, mx: 'auto'}}>
            {children}
        </Box>
    );
};

const ControlPanelShell: React.FC<{children: React.ReactNode}> = ({children}) => (
    <ThemeProvider theme={theme}>
        <CssBaseline/>
        <SaveStatusProvider>
            <TelopPresetsProvider>
                <TelopHotkeys/>
                <Box sx={{minHeight: '100vh', bgcolor: 'background.default', color: 'text.primary'}}>
                    <Header/>
                    <Main>{children}</Main>
                </Box>
            </TelopPresetsProvider>
        </SaveStatusProvider>
    </ThemeProvider>
);

export default ControlPanelShell;
