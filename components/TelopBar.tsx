'use client';

import CampaignRoundedIcon from '@mui/icons-material/CampaignRounded';
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';
import ExpandLessRoundedIcon from '@mui/icons-material/ExpandLessRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import {Alert, Box, Button, ButtonBase, Typography} from '@mui/material';
import React, {useEffect, useState} from 'react';

import {monoFontFamily, tokens} from '../app/control-panel/theme';
import {getItem, setItem} from '../lib/localStorage';
import {TELOP_SHORTCUT_KEYS, TelopPreset} from '../lib/telopTypes';

import {CompactRest, useInCompactLive} from './compactLayout';
import {useTelopPresets} from './controlPanelContext';
import LiveCard, {LiveCardNote} from './LiveCard';

// 「ほかのテロップ」を開いているか（開き直したときにそのままにする）
export const TELOP_MORE_OPEN_KEY = 'control-panel-telop-more-open';

const readMoreOpen = (): boolean => {
    try {
        return getItem<boolean>(TELOP_MORE_OPEN_KEY) === true;
    } catch {
        return false;
    }
};

/** テロップに出さず、チャットに書き込むだけのもの */
const ChatOnlyMark: React.FC = () => (
    <ChatBubbleOutlineRoundedIcon
        role="img"
        aria-label="チャットだけ"
        titleAccess="配信画面には出さず、チャットに書き込むだけ"
        sx={{fontSize: 14, color: 'text.secondary', flex: 'none'}}
    />
);

// キーの高さ。コンパクト表示（幅 600px 未満）は 46px にして、10 個を 1 画面に収める
const KEY_HEIGHT_COMPACT = 46;

const KeyButton: React.FC<{preset: TelopPreset; keyName: string; shown: boolean; compact: boolean; onShow: () => void}> = ({preset, keyName, shown, compact, onShow}) => (
    <ButtonBase
        onClick={onShow}
        aria-keyshortcuts={keyName}
        sx={{
            display: 'flex', alignItems: 'center', gap: compact ? 2 : 2.5, minHeight: compact ? KEY_HEIGHT_COMPACT : tokens.height.live, px: compact ? 2.5 : 3, minWidth: 0,
            borderRadius: `${tokens.radius.control}px`, border: '2px solid', borderColor: shown ? 'primary.main' : '#2E3542',
            bgcolor: '#222833', color: 'text.primary', fontSize: compact ? 14 : 15, fontWeight: 600, textAlign: 'left', justifyContent: 'flex-start',
            '&:hover': {bgcolor: '#28303C'},
            '&.Mui-focusVisible': {outline: `2px solid ${tokens.color.primary}`, outlineOffset: 2},
        }}
    >
        <Box
            component="kbd"
            sx={{
                flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26,
                borderRadius: '7px', bgcolor: 'primary.main', color: 'primary.contrastText', fontFamily: monoFontFamily, fontSize: 13, fontWeight: 700,
            }}
        >
            {keyName}
        </Box>
        {!preset.display && <ChatOnlyMark/>}
        <Box component="span" sx={{flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
            {preset.text}
        </Box>
        {shown && <Box component="span" sx={{flex: 'none', fontSize: 11, fontWeight: 700, color: '#FF9CC0'}}>表示中</Box>}
    </ButtonBase>
);

/**
 * 配信中の画面のテロップ。先頭の 10 個はキーボードの 1〜9, 0 でも出せる
 * （キーは共通の外枠の useTelopHotkeys が受けるので、どの画面からでも効く）。11 個目以降は「ほかのテロップ」で開く（コンパクト表示では最後の折りたたみに入れる）
 */
const TelopBar: React.FC = () => {
    const {presets, error, show, shownId} = useTelopPresets();
    const compact = useInCompactLive();
    const [moreOpen, setMoreOpen] = useState(false);

    useEffect(() => {
        // localStorage はブラウザでしか読めないので、表示した後に合わせる
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMoreOpen(readMoreOpen());
    }, []);

    const toggleMore = () => {
        setItem(TELOP_MORE_OPEN_KEY, !moreOpen);
        setMoreOpen(!moreOpen);
    };

    const keyed = presets?.slice(0, TELOP_SHORTCUT_KEYS.length) ?? [];
    const extras = presets?.slice(TELOP_SHORTCUT_KEYS.length) ?? [];

    const extraButtons = (
        <Box data-testid="telop-more" sx={{display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: compact ? 0 : 1.5}}>
            {extras.map((preset) => (
                <Button key={preset.id} variant="outlined" size="small" onClick={() => show(preset.id)} sx={{gap: 1}}>
                    {!preset.display && <ChatOnlyMark/>}
                    {preset.text}
                    {shownId === preset.id && <Box component="span" sx={{fontSize: 11, fontWeight: 700, color: '#FF9CC0'}}>表示中</Box>}
                </Button>
            ))}
        </Box>
    );

    return (
        <LiveCard
            icon={CampaignRoundedIcon}
            title="テロップ"
            hideTitle={compact}
            sx={compact ? {p: 2.5} : undefined}
            aside={<LiveCardNote>キーボードの 1〜0 でも出せます</LiveCardNote>}
        >
            {error && <Alert severity="error" sx={{mb: 2}}>{error}</Alert>}
            {presets && presets.length === 0 && (
                <Typography variant="body2" sx={{color: 'text.secondary'}}>テロップのプリセットがありません（設定の「テロップのプリセット」で追加できます）</Typography>
            )}
            {keyed.length > 0 && (
                <Box data-testid="telop-buttons" sx={{display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: compact ? 1.5 : 2}}>
                    {keyed.map((preset, index) => (
                        <KeyButton
                            key={preset.id}
                            preset={preset}
                            keyName={TELOP_SHORTCUT_KEYS[index]}
                            shown={shownId === preset.id}
                            compact={compact}
                            onShow={() => show(preset.id)}
                        />
                    ))}
                </Box>
            )}
            {extras.length > 0 && (compact ? (
                // コンパクト表示では、最後の折りたたみの中にそのまま並べる（折りたたみが開閉を受け持つ）
                <CompactRest slot="telop">{extraButtons}</CompactRest>
            ) : (
                <>
                    <Button
                        size="small"
                        onClick={toggleMore}
                        aria-expanded={moreOpen}
                        startIcon={moreOpen ? <ExpandLessRoundedIcon/> : <ExpandMoreRoundedIcon/>}
                        sx={{mt: 2.5, color: 'text.secondary'}}
                    >
                        {moreOpen ? 'たたむ' : `ほかのテロップ（${extras.length}）`}
                    </Button>
                    {moreOpen && extraButtons}
                </>
            ))}
        </LiveCard>
    );
};

export default TelopBar;
