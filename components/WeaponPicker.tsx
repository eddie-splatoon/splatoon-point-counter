'use client';

import {Box, ButtonBase, Typography} from '@mui/material';
import React from 'react';

import {SALMON_WEAPONS, SALMON_WEAPON_CATEGORIES} from '../lib/salmonWeapons';

import WeaponIcon from './WeaponIcon';

interface WeaponPickerProps {
    selected: readonly string[];
    onSelect: (key: string) => void;
    isDisabled?: (key: string) => boolean;
    label: string; // 支援技術向けのグループ名
}

/** カテゴリごとにブキの画像ボタンを並べるパレット（サーモンランの記録・ブキ埋めカードの手動入力で使う） */
const WeaponPicker: React.FC<WeaponPickerProps> = ({selected, onSelect, isDisabled, label}) => (
    <Box role="group" aria-label={label} sx={{display: 'flex', flexDirection: 'column', gap: 0.5}}>
        {SALMON_WEAPON_CATEGORIES.map((category) => (
            <Box key={category} sx={{display: 'flex', alignItems: 'center', gap: 1}}>
                <Typography variant="caption" sx={{width: 80, flexShrink: 0, color: 'text.secondary'}}>{category}</Typography>
                <Box sx={{display: 'flex', flexWrap: 'wrap', gap: 0.5}}>
                    {SALMON_WEAPONS.filter((w) => w.category === category).map((weapon) => {
                        const isSelected = selected.includes(weapon.key);
                        const disabled = isDisabled?.(weapon.key) ?? false;
                        return (
                            <ButtonBase
                                key={weapon.key}
                                onClick={() => onSelect(weapon.key)}
                                disabled={disabled}
                                aria-pressed={isSelected}
                                aria-label={weapon.name}
                                sx={{
                                    borderRadius: 1,
                                    p: 0.25,
                                    border: '2px solid',
                                    borderColor: isSelected ? 'primary.main' : 'transparent',
                                    bgcolor: isSelected ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
                                    opacity: disabled ? 0.35 : isSelected ? 1 : 0.6,
                                    '&:hover': {opacity: 1},
                                }}
                            >
                                <WeaponIcon weapon={weapon} size={36}/>
                            </ButtonBase>
                        );
                    })}
                </Box>
            </Box>
        ))}
    </Box>
);

export default WeaponPicker;
