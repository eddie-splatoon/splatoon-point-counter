'use client';

import {motion} from 'motion/react';
import React, {useState} from 'react';

import {SALMON_WEAPONS, WeaponCard as WeaponCardData} from '../lib/salmonWeapons';

import FireworksEffect from './FireworksEffect';
import WeaponIcon from './WeaponIcon';

interface WeaponCardProps {
    card: WeaponCardData;
    // サイドパネル（幅 250px）向けの小さい表示。試合中に埋まり具合がなんとなくわかる程度の大きさ
    compact?: boolean;
}

const INK_COLOR = '#FF40A0';
const COMPLETE_COLOR = '#32E675';
const COLUMNS = 9;
const CELL_SIZE = 58;
// サイドパネルではスケジュールなどと並べても下段に収まるよう、列を増やして高さを抑える
const COMPACT_COLUMNS = 12;
const COMPACT_ICON_SIZE = 15;

const obtainedKeys = (card: WeaponCardData) => card.obtained.map((w) => w.key);

/**
 * オールランダムのブキ埋めカード。埋まったブキはカラーにしてインクのスタンプを押す。
 * スタンプの演出は新しく埋まった瞬間だけ（表示した時点で埋まっていたものや、新しいカードの開始では再生しない）。
 * 全種そろった瞬間に花火を出す
 */
const WeaponCard: React.FC<WeaponCardProps> = ({card, compact = false}) => {
    const keys = obtainedKeys(card);
    const stateKey = `${card.startedAt}:${keys.join(',')}`;
    const [prev, setPrev] = useState({stateKey, startedAt: card.startedAt, keys});
    const [stamping, setStamping] = useState<string[]>([]);
    const [celebration, setCelebration] = useState(0);
    // 前回の状態と比べ、レンダー中に state を調整する（React の「props の変化に合わせて state を調整する」パターン）
    if (prev.stateKey !== stateKey) {
        const sameCard = prev.startedAt === card.startedAt;
        const newlyObtained = sameCard ? keys.filter((key) => !prev.keys.includes(key)) : [];
        setStamping((current) => [...(sameCard ? current.filter((key) => keys.includes(key)) : []), ...newlyObtained]);
        if (sameCard && prev.keys.length < card.total && keys.length >= card.total) setCelebration((n) => n + 1);
        setPrev({stateKey, startedAt: card.startedAt, keys});
    }

    const complete = keys.length >= card.total;

    return (
        <div
            className={compact
                ? 'relative w-[250px] max-w-full bg-black/80 text-white rounded-2xl shadow-2xl border-2 border-white/20 p-3'
                : 'relative inline-block bg-black/80 text-white rounded-3xl shadow-2xl border-2 border-white/20 p-4'}
            data-testid="weapon-card"
            data-compact={compact}
        >
            <div className="flex justify-between items-baseline px-1">
                <p className="font-bold" style={{color: INK_COLOR, fontSize: compact ? '20px' : '26px'}}>{compact ? 'ブキ埋め' : 'オールランダム ブキ埋め'}</p>
                <p className="font-bold tabular-nums" style={{fontSize: compact ? '16px' : '24px', color: complete ? COMPLETE_COLOR : undefined}} data-testid="weapon-card-progress">
                    {keys.length} / {card.total}
                </p>
            </div>
            <div className={`mt-1 ${compact ? 'mb-2 h-1.5' : 'mb-3 h-2'} rounded-full bg-white/15 overflow-hidden`}>
                <div className="h-full rounded-full" style={{width: `${(keys.length / card.total) * 100}%`, backgroundColor: complete ? COMPLETE_COLOR : INK_COLOR}}/>
            </div>
            <ul
                // 小さい表示はカードの幅に合わせてマスを縮める
                className={compact ? 'grid gap-0.5' : 'grid gap-1'}
                style={{gridTemplateColumns: compact ? `repeat(${COMPACT_COLUMNS}, minmax(0, 1fr))` : `repeat(${COLUMNS}, ${CELL_SIZE}px)`}}
            >
                {SALMON_WEAPONS.map((weapon) => {
                    const obtained = keys.includes(weapon.key);
                    return (
                        <li
                            key={weapon.key}
                            className={`relative flex items-center justify-center ${compact ? 'aspect-square rounded-md' : 'rounded-xl'}`}
                            style={{...(compact ? {} : {width: CELL_SIZE, height: CELL_SIZE}), backgroundColor: 'rgba(255, 255, 255, 0.08)'}}
                            data-weapon={weapon.key}
                            data-obtained={obtained}
                        >
                            {/* インクのスタンプ。ブキの後ろに丸いインクを置く */}
                            {obtained && (
                                <motion.span
                                    className={`absolute ${compact ? 'inset-0' : 'inset-1'} rounded-full`}
                                    style={{backgroundColor: INK_COLOR}}
                                    initial={stamping.includes(weapon.key) ? {scale: 2.2, opacity: 0} : false}
                                    animate={{scale: 1, opacity: 0.85}}
                                    transition={{type: 'spring', stiffness: 400, damping: 14}}
                                    data-testid={`weapon-stamp-${weapon.key}`}
                                    data-animated={stamping.includes(weapon.key)}
                                />
                            )}
                            <WeaponIcon
                                weapon={weapon}
                                size={compact ? COMPACT_ICON_SIZE : CELL_SIZE - 8}
                                className={`relative ${obtained ? '' : 'grayscale opacity-30'}`}
                            />
                        </li>
                    );
                })}
            </ul>
            {/* 全種コンプの花火。達成のたびに key で作り直して最初から再生する */}
            {celebration > 0 && (
                <div className={`absolute inset-0 pointer-events-none overflow-hidden ${compact ? 'rounded-2xl' : 'rounded-3xl'}`}>
                    <FireworksEffect key={celebration} trigger/>
                </div>
            )}
        </div>
    );
};

export default WeaponCard;
