'use client';

import CampaignRoundedIcon from '@mui/icons-material/CampaignRounded';
import {Alert, Box, Button, Paper, Typography} from '@mui/material';
import React from 'react';

import {monoFontFamily, tokens} from '../app/control-panel/theme';
import {TELOP_SHORTCUT_KEYS} from '../lib/telopTypes';

import {useTelopPresets} from './controlPanelContext';
import SectionTitle from './SectionTitle';

/**
 * 配信中の画面のテロップのボタン。キーボードの 1〜9, 0（先頭の 10 個）でも出せる
 * （キーは共通の外枠の useTelopHotkeys が受けるので、どの画面からでも効く）
 */
const TelopBar: React.FC = () => {
    const {presets, error, show} = useTelopPresets();

    return (
        <Paper sx={{mb: 4, p: 4}}>
            <SectionTitle icon={CampaignRoundedIcon}>テロップ</SectionTitle>
            {error && <Alert severity="error" sx={{mb: 2}}>{error}</Alert>}
            {presets && presets.length > 0 ? (
                // プリセットが多いと高くなるので詰めて並べる。キーの割り当ての無いものは outlined で区別する
                <Box data-testid="telop-buttons" sx={{display: 'flex', flexWrap: 'wrap', gap: 1.5}}>
                    {presets.map((preset, index) => (
                        <Button
                            key={preset.id}
                            variant={TELOP_SHORTCUT_KEYS[index] !== undefined ? 'contained' : 'outlined'}
                            size="small"
                            onClick={() => show(preset.id)}
                            sx={{textTransform: 'none'}}
                        >
                            {TELOP_SHORTCUT_KEYS[index] !== undefined && (
                                <Box component="kbd" sx={{mr: 2, px: 1.5, borderRadius: `${tokens.radius.badge}px`, bgcolor: 'rgba(0,0,0,0.3)', fontFamily: monoFontFamily}}>
                                    {TELOP_SHORTCUT_KEYS[index]}
                                </Box>
                            )}
                            {/* テロップに出さず、コメントだけのもの（押しても配信画面には出ない） */}
                            {!preset.display && (
                                <Box component="span" role="img" aria-label="コメントだけ" title="配信画面には出さず、チャットに書き込むだけ" sx={{mr: 0.5}}>
                                    💬
                                </Box>
                            )}
                            {preset.text}
                        </Button>
                    ))}
                </Box>
            ) : (
                presets && <Typography variant="body2" sx={{color: 'text.secondary'}}>テロップのプリセットがありません（設定の「テロップ」で追加できます）</Typography>
            )}
        </Paper>
    );
};

export default TelopBar;
