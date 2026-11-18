'use client';

import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import VideocamRoundedIcon from '@mui/icons-material/VideocamRounded';
import {Box, IconButton, NativeSelect, Typography} from '@mui/material';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import React, {useEffect, useState} from 'react';

import {SETTINGS_SECTIONS, SettingsSectionId} from '../app/control-panel/settings/sections';
import {monoFontFamily, tokens} from '../app/control-panel/theme';
import {OVERLAY_PAGES, OverlayPage} from '../lib/overlayPages';

import {useTelopPresets} from './controlPanelContext';
import LiveCard, {LiveCardNote} from './LiveCard';
import {ScoreAutoUpdateCard} from './ScoreDisplayPanel';
import {AppearanceSettingsCard, StreamSettingsGate} from './StreamSettingsPanels';
import TelopPanel from './TelopPanel';
import {useStreamSettings} from './useStreamSettings';
import VoiceSettingsPanel from './VoiceSettingsPanel';

const TelopSection: React.FC = () => {
    // プリセットを編集したら、配信中の画面のボタンと数字キーに読み込み直させる
    const {reload} = useTelopPresets();
    return <TelopPanel onPresetsChange={reload}/>;
};

const AppearanceSection: React.FC = () => {
    const state = useStreamSettings();
    return (
        <StreamSettingsGate state={state}>
            {(settings) => <AppearanceSettingsCard settings={settings} update={state.update}/>}
        </StreamSettingsGate>
    );
};

// コピーしたことを見せる時間
const COPIED_MS = 1500;

const OverlayRow: React.FC<{page: OverlayPage; origin: string}> = ({page, origin}) => {
    const [copied, setCopied] = useState(false);
    const url = `${origin}${page.href}`;
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), COPIED_MS);
        } catch {
            // クリップボードが使えないときは、URL を選んでコピーしてもらう
        }
    };
    return (
        <Box component="li" sx={{display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, py: 2, borderTop: '1px solid #232832'}}>
            <Typography sx={{flex: '1 1 180px', fontSize: 14, fontWeight: 600}}>{page.label}</Typography>
            <Box sx={{flex: '2 1 280px', minWidth: 0, display: 'flex', alignItems: 'center', gap: 1}}>
                <Box component="code" sx={{flex: 1, minWidth: 0, overflowWrap: 'anywhere', fontFamily: monoFontFamily, fontSize: 12, bgcolor: tokens.color.surface2, px: 2, py: 1, borderRadius: `${tokens.radius.badge}px`}}>
                    {url}
                </Box>
                <IconButton size="small" aria-label={`${page.label} の URL をコピー`} onClick={() => void copy()} sx={{color: copied ? 'success.main' : 'text.secondary'}}>
                    {copied ? <CheckRoundedIcon fontSize="small"/> : <ContentCopyRoundedIcon fontSize="small"/>}
                </IconButton>
            </Box>
            <Typography sx={{flex: '0 0 96px', textAlign: 'right', fontFamily: monoFontFamily, fontSize: 12, color: 'text.secondary'}}>
                {page.size ? `${page.size.width}×${page.size.height}` : '音声のみ'}
            </Typography>
        </Box>
    );
};

/** OBS のブラウザソースに置くオーバーレイの URL と大きさ（lib/overlayPages.ts。ランチャーと同じ一覧） */
const ObsSection: React.FC = () => {
    const [origin, setOrigin] = useState('');
    useEffect(() => {
        // URL はこの画面を開いているホストで出す（サーバーでは分からないので、マウント後に読む）
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setOrigin(window.location.origin);
    }, []);
    return (
        <LiveCard icon={VideocamRoundedIcon} title="OBS のブラウザソース" aside={<LiveCardNote>{OVERLAY_PAGES.length} 個</LiveCardNote>}>
            <Typography variant="caption" sx={{display: 'block', mb: 2}}>
                ブラウザソースの URL に入れ、幅と高さを右の大きさにします。読み上げは音声だけなので、大きさは何でもかまいません。
            </Typography>
            <Box component="ul" aria-label="オーバーレイの一覧" sx={{listStyle: 'none', m: 0, p: 0}}>
                {OVERLAY_PAGES.map((page) => <OverlayRow key={page.href} page={page} origin={origin}/>)}
            </Box>
        </LiveCard>
    );
};

const SECTION_CONTENT: Record<SettingsSectionId, React.FC> = {
    telop: TelopSection,
    voice: VoiceSettingsPanel,
    score: ScoreAutoUpdateCard,
    appearance: AppearanceSection,
    obs: ObsSection,
};

const sectionHref = (id: SettingsSectionId) => `/control-panel/settings/${id}`;

/** 設定の画面（設計書 6 章）。左にメニュー（600px 未満は上にセレクト）、右に中身 */
const ControlPanelSettings: React.FC<{section: SettingsSectionId}> = ({section}) => {
    const router = useRouter();
    const Content = SECTION_CONTENT[section];
    return (
        <Box sx={{display: 'flex', gap: 5, alignItems: 'flex-start', flexDirection: {xs: 'column', sm: 'row'}}}>
            <NativeSelect
                value={section}
                onChange={(e) => router.push(sectionHref(e.target.value as SettingsSectionId))}
                inputProps={{'aria-label': '設定のメニュー'}}
                sx={{display: {xs: 'inline-flex', sm: 'none'}, width: '100%'}}
            >
                {SETTINGS_SECTIONS.map(({id, label}) => <option key={id} value={id}>{label}</option>)}
            </NativeSelect>
            <Box component="nav" aria-label="設定のメニュー" sx={{display: {xs: 'none', sm: 'flex'}, flexDirection: 'column', gap: 1, flex: '0 0 220px'}}>
                {SETTINGS_SECTIONS.map(({id, label}) => {
                    const current = id === section;
                    return (
                        <Box
                            key={id}
                            component={Link}
                            href={sectionHref(id)}
                            aria-current={current ? 'page' : undefined}
                            sx={{
                                display: 'flex', alignItems: 'center', minHeight: 40, px: 3, borderRadius: `${tokens.radius.control}px`, textDecoration: 'none',
                                fontWeight: current ? 700 : 500,
                                color: current ? '#FF9CC0' : '#B5BCC8',
                                bgcolor: current ? tokens.color.primarySoft : 'transparent',
                                '&:hover': {color: current ? '#FF9CC0' : tokens.color.text},
                            }}
                        >
                            {label}
                        </Box>
                    );
                })}
            </Box>
            <Box sx={{flex: '1 1 0', minWidth: 0, width: '100%'}}>
                <Content/>
            </Box>
        </Box>
    );
};

export default ControlPanelSettings;
