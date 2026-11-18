'use client';

import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ErrorRoundedIcon from '@mui/icons-material/ErrorRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import {Box, CssBaseline, IconButton, NativeSelect, Typography} from '@mui/material';
import {ThemeProvider} from '@mui/material/styles';
import Image from 'next/image';
import Link from 'next/link';
import {usePathname, useRouter} from 'next/navigation';
import React from 'react';

import {theme, tokens} from '../app/control-panel/theme';

import {BreakBanner, BreakButton, useBreak} from './BreakControl';
import {useCompact} from './compactLayout';
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
    // 狭い幅では、保存に失敗したときだけ出す
    const compact = useCompact();
    if (compact && !failed) return null;
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
    const router = useRouter();
    const compact = useCompact();
    if (compact) {
        // 狭い幅ではセレクトにする（設定の画面はどのフェーズでもないので、選んでいない状態で出す）
        const current = CONTROL_PANEL_PHASES.find(({href}) => href === pathname)?.href ?? '';
        return (
            <NativeSelect
                value={current}
                onChange={(e) => router.push(e.target.value)}
                inputProps={{'aria-label': 'フェーズ'}}
                disableUnderline
                sx={{height: 36, px: 3, borderRadius: `${tokens.radius.pill}px`, border: '1px solid', borderColor: tokens.color.borderStrong, bgcolor: tokens.color.surface2, fontSize: 13, fontWeight: 700}}
            >
                {current === '' && <option value="" disabled>フェーズ</option>}
                {CONTROL_PANEL_PHASES.map(({href, label}) => <option key={href} value={href}>{label}</option>)}
            </NativeSelect>
        );
    }
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
    const compact = useCompact();
    return (
        <Box sx={{position: 'sticky', top: 0, zIndex: 10}}>
            <Box
                component="header"
                sx={{
                    display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: compact ? 2 : 4, px: compact ? 3 : 5, py: compact ? 2 : 3,
                    bgcolor: tokens.color.header, borderBottom: 1, borderColor: 'divider',
                }}
            >
                <Box sx={{display: 'flex', alignItems: 'center', gap: 2}}>
                    <Image src="/favicon.svg" alt={compact ? '配信パネル' : ''} width={compact ? 24 : 28} height={compact ? 24 : 28}/>
                    {!compact && <Typography variant="h1" component="p">配信パネル</Typography>}
                </Box>
                <PhaseSwitch/>
                <Box sx={{flex: 1}}/>
                <SaveIndicator/>
                <BreakButton view={breakView} compact={compact}/>
                <IconButton component={Link} href="/control-panel/settings" aria-label="設定" size={compact ? 'small' : 'medium'}>
                    <SettingsRoundedIcon/>
                </IconButton>
            </Box>
            <BreakBanner view={breakView}/>
        </Box>
    );
};

// 配信中の画面は 3 列、準備の画面は 2 列、設定はメニューと中身なので広く使う。振り返りは読みやすい幅にする
const PAGE_MAX_WIDTH = 900;
export const pageMaxWidth = (pathname: string) => {
    if (pathname === '/control-panel') return 1600;
    if (pathname === '/control-panel/prepare' || pathname.startsWith('/control-panel/settings')) return 1200;
    return PAGE_MAX_WIDTH;
};

const Main: React.FC<{children: React.ReactNode}> = ({children}) => {
    const pathname = usePathname();
    return (
        // 狭い幅では画面の端の余白を 12px にする
        <Box component="main" sx={{px: {xs: 3, sm: 5}, py: {xs: 3, sm: 4}, maxWidth: pageMaxWidth(pathname), mx: 'auto'}}>
            {children}
        </Box>
    );
};

/** コントロールパネルの共通の外枠（テーマ・ヘッダー・休憩の帯・テロップの数字キー・保存の状態） */
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
