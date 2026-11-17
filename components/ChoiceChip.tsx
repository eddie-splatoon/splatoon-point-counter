import {ButtonBase} from '@mui/material';
import React from 'react';

import {tokens} from '../app/control-panel/theme';

interface ChoiceChipProps {
    selected: boolean;
    /** 選んだときの色（サイドパネルのローテーション枠は緑） */
    tone?: 'primary' | 'success';
    /** toggle は aria-pressed（いくつでも選べる）、radio は aria-checked（1 つだけ選ぶ） */
    kind?: 'toggle' | 'radio';
    disabled?: boolean;
    onClick: () => void;
    children: React.ReactNode;
}

const TONES = {
    primary: {border: tokens.color.primary, background: tokens.color.primarySoft, text: '#FF9CC0'},
    success: {border: tokens.color.success, background: tokens.color.successSoft, text: '#7FE3B0'},
} as const;

/** 準備の画面の、選ぶ・切り替えるチップ（設計書 4 章） */
const ChoiceChip: React.FC<ChoiceChipProps> = ({selected, tone = 'primary', kind = 'toggle', disabled = false, onClick, children}) => {
    const colors = TONES[tone];
    return (
        <ButtonBase
            onClick={onClick}
            disabled={disabled}
            role={kind === 'radio' ? 'radio' : undefined}
            aria-checked={kind === 'radio' ? selected : undefined}
            aria-pressed={kind === 'toggle' ? selected : undefined}
            sx={{
                height: 34, px: 3, borderRadius: `${tokens.radius.pill}px`, fontSize: 13, fontWeight: 600,
                border: '1px solid', borderColor: selected ? colors.border : tokens.color.borderStrong,
                bgcolor: selected ? colors.background : 'transparent',
                color: selected ? colors.text : '#B5BCC8',
                '&.Mui-disabled': {opacity: 0.4},
                '&.Mui-focusVisible': {outline: `2px solid ${tokens.color.primary}`, outlineOffset: 2},
            }}
        >
            {children}
        </ButtonBase>
    );
};

export default ChoiceChip;
