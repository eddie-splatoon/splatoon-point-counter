/* eslint-disable @next/next/no-img-element -- 画像は外部（GitHub）にあり、next/image の最適化を通さずそのまま表示する */
'use client';

import React, {useState} from 'react';

import {SalmonWeapon, weaponImageUrl} from '../lib/salmonWeapons';

interface WeaponIconProps {
    weapon: SalmonWeapon;
    size: number;
    className?: string;
}

/** ブキの画像。読み込めなければ（リンク切れ・オフライン）ブキ名を文字で出す */
const WeaponIcon: React.FC<WeaponIconProps> = ({weapon, size, className}) => {
    const [failed, setFailed] = useState(false);
    if (failed) {
        return (
            <span
                className={`flex items-center justify-center text-center leading-tight break-all ${className ?? ''}`}
                style={{width: size, height: size, fontSize: Math.max(9, size / 6)}}
                title={weapon.name}
                data-testid="weapon-name-fallback"
            >
                {weapon.name}
            </span>
        );
    }
    return (
        <img
            src={weaponImageUrl(weapon)}
            alt={weapon.name}
            title={weapon.name}
            width={size}
            height={size}
            className={`object-contain ${className ?? ''}`}
            style={{width: size, height: size}}
            onError={() => setFailed(true)}
        />
    );
};

export default WeaponIcon;
