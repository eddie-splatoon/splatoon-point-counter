'use client';

import {Box, Paper, Typography} from '@mui/material';
import Link from 'next/link';
import React, {useEffect, useState} from 'react';

import {SETTINGS_SECTIONS, SettingsSectionId} from '../app/control-panel/settings/sections';
import {monoFontFamily, tokens} from '../app/control-panel/theme';

import {useTelopPresets} from './controlPanelContext';
import {ScoreAutoUpdateCard} from './ScoreDisplayPanel';
import {AppearanceSettingsCard, StreamSettingsGate} from './StreamSettingsPanels';
import TelopPanel from './TelopPanel';
import {useStreamSettings} from './useStreamSettings';
import VoiceSettingsPanel from './VoiceSettingsPanel';

// OBS のブラウザソースの URL
const codeStyle: React.CSSProperties = {backgroundColor: tokens.color.surface2, padding: '2px 6px', borderRadius: tokens.radius.badge, fontFamily: monoFontFamily};

const TelopSection: React.FC = () => {
    // プリセットを編集したら、配信中の画面のボタンと数字キーに読み込み直させる
    const {reload} = useTelopPresets();
    return (
        <>
            <TelopPanel onPresetsChange={reload}/>
            <VoiceSettingsPanel/>
        </>
    );
};

const AppearanceSection: React.FC = () => {
    const state = useStreamSettings();
    return (
        <>
            <StreamSettingsGate state={state}>
                {(settings) => <AppearanceSettingsCard settings={settings} update={state.update}/>}
            </StreamSettingsGate>
            <ScoreAutoUpdateCard/>
        </>
    );
};

// オーバーレイの一覧は #132 で作り直す。ここでは以前の画面の下にあった案内をそのまま置く
const ObsSection: React.FC = () => {
    const [origin, setOrigin] = useState('');
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setOrigin(window.location.origin);
    }, []);
    return (
        <Paper sx={{p: 4}}>
            <Typography variant="body2" sx={{fontWeight: 'bold'}}>OBSブラウザソース設定</Typography>
            <Typography variant="body2">スコア表示URL: <code style={codeStyle}>{origin}/obs-overlay</code></Typography>
            <Typography variant="body2">バーンダウン表示URL: <code style={codeStyle}>{origin}/burndown-overlay</code></Typography>
            <Typography variant="body2">サイドパネル表示URL: <code style={codeStyle}>{origin}/side-panel-overlay</code></Typography>
            <Typography variant="body2">幅: 1450, 高さ: 160 (スコア表示)</Typography>
            <Typography variant="body2">幅: 250, 高さ: 584 (バーンダウン表示・サイドパネル表示)</Typography>
        </Paper>
    );
};

const SECTION_CONTENT: Record<SettingsSectionId, React.FC> = {
    telop: TelopSection,
    appearance: AppearanceSection,
    obs: ObsSection,
};

/** 設定の画面。左にメニュー、右に中身 */
const ControlPanelSettings: React.FC<{section: SettingsSectionId}> = ({section}) => {
    const Content = SECTION_CONTENT[section];
    return (
        <Box sx={{display: 'flex', gap: 5, alignItems: 'flex-start', flexWrap: 'wrap'}}>
            <Box component="nav" aria-label="設定のメニュー" sx={{display: 'flex', flexDirection: 'column', gap: 1, flex: '0 0 220px'}}>
                {SETTINGS_SECTIONS.map(({id, label}) => {
                    const current = id === section;
                    return (
                        <Box
                            key={id}
                            component={Link}
                            href={`/control-panel/settings/${id}`}
                            aria-current={current ? 'page' : undefined}
                            sx={{
                                px: 3, py: 2.5, borderRadius: `${tokens.radius.control}px`, textDecoration: 'none', fontWeight: current ? 700 : 500,
                                color: current ? tokens.color.text : tokens.color.textMuted,
                                bgcolor: current ? tokens.color.surface2 : 'transparent',
                                '&:hover': {color: tokens.color.text},
                            }}
                        >
                            {label}
                        </Box>
                    );
                })}
            </Box>
            <Box sx={{flex: '1 1 420px', minWidth: 0}}>
                <Content/>
            </Box>
        </Box>
    );
};

export default ControlPanelSettings;
