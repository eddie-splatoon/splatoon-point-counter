'use client';

import ExpandLessRoundedIcon from '@mui/icons-material/ExpandLessRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import {Box, ButtonBase, Paper, Typography, useMediaQuery} from '@mui/material';
import {useTheme} from '@mui/material/styles';
import React, {createContext, useCallback, useContext, useState} from 'react';
import {createPortal} from 'react-dom';

import {tokens} from '../app/control-panel/theme';

// 幅 600px 未満のコンパクト表示（設計書 2・3 章、キャンバス LiveNarrow）。
// 配信中の画面では、カードの「ふだん使わない部分」を最後の折りたたみ 1 つにまとめる。カードを 2 回描くと状態や読み込みが二重になるので、
// カードは 1 つのまま、その部分だけを折りたたみの中の置き場（slot）に portal で描く

/** 幅 600px 未満か（MUI の sm 未満） */
export const useCompact = () => useMediaQuery(useTheme().breakpoints.down('sm'));

export type CompactSlotName = 'telop' | 'salmon' | 'join';

const SLOT_LABELS: Record<CompactSlotName, string> = {
    telop: 'ほかのテロップ',
    salmon: 'サーモンランの記録',
    join: '視聴者参加',
};

type Slots = Record<CompactSlotName, HTMLElement | null>;

const CompactSlotsContext = createContext<Slots | null>(null);

/** コンパクト表示の配信中の画面の中か（カードの見た目を詰める） */
export const useInCompactLive = () => useContext(CompactSlotsContext) !== null;

/**
 * カードの「ふだん使わない部分」。コンパクト表示の配信中の画面では最後の折りたたみの置き場に描き、それ以外ではその場に描く。
 * 置き場がまだ無い（最初の描画）ときは何も描かない（その場に描いてから移すと、中の状態が作り直されるため）
 */
export const CompactRest: React.FC<{slot: CompactSlotName; children: React.ReactNode}> = ({slot, children}) => {
    const slots = useContext(CompactSlotsContext);
    if (!slots) return <>{children}</>;
    const node = slots[slot];
    return node ? createPortal(children, node) : null;
};

const SlotBox: React.FC<{name: CompactSlotName; onNode: (name: CompactSlotName, node: HTMLElement | null) => void}> = ({name, onNode}) => {
    // 描くたびに ref を付け直すと置き場の state が変わり続けるので、固定する
    const ref = useCallback((node: HTMLElement | null) => onNode(name, node), [name, onNode]);
    return (
        // 中身が無い置き場（ほかのテロップが無いなど）は、見出しごと隠す
        <Box sx={{'&:has(> [data-slot]:empty)': {display: 'none'}}}>
            <Typography component="h3" sx={{fontSize: 12, fontWeight: 700, color: 'text.secondary', mb: 2}}>{SLOT_LABELS[name]}</Typography>
            <Box data-slot={name} ref={ref}/>
        </Box>
    );
};

/**
 * コンパクト表示の配信中の画面。children（よく押すカード）の後に、折りたたみ 1 つ（ほかのテロップ・エフェクト・クリップ・記録など）を置く。
 * 折りたたみの中身は閉じていても描いたまま隠す（portal の置き場と、中のカードの状態を保つため）
 */
export const CompactLive: React.FC<{children: React.ReactNode; renderFold: (slot: (name: CompactSlotName) => React.ReactNode) => React.ReactNode}> = ({children, renderFold}) => {
    const [slots, setSlots] = useState<Slots>({telop: null, salmon: null, join: null});
    const [open, setOpen] = useState(false);
    const onNode = useCallback((name: CompactSlotName, node: HTMLElement | null) => {
        setSlots((current) => (current[name] === node ? current : {...current, [name]: node}));
    }, []);

    return (
        <CompactSlotsContext.Provider value={slots}>
            <Box sx={{display: 'flex', flexDirection: 'column', gap: 2.5}}>
                {children}
                <Paper>
                    <ButtonBase
                        onClick={() => setOpen(!open)}
                        aria-expanded={open}
                        aria-controls="compact-fold"
                        sx={{width: '100%', minHeight: 44, px: 3, justifyContent: 'space-between', color: '#B5BCC8', fontSize: 13, fontWeight: 600, borderRadius: `${tokens.radius.card}px`}}
                    >
                        ほかのテロップ・エフェクト・クリップ・記録
                        {open ? <ExpandLessRoundedIcon fontSize="small"/> : <ExpandMoreRoundedIcon fontSize="small"/>}
                    </ButtonBase>
                    <Box id="compact-fold" data-testid="compact-fold" hidden={!open} sx={{px: 2.5, pb: 2.5}}>
                        <Box sx={{display: 'flex', flexDirection: 'column', gap: 4}}>
                            {renderFold((name) => <SlotBox key={name} name={name} onNode={onNode}/>)}
                        </Box>
                    </Box>
                </Paper>
            </Box>
        </CompactSlotsContext.Provider>
    );
};
