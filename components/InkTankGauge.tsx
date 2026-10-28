'use client';

import {motion} from 'motion/react';
import React, {useState} from 'react';

import BubbleEffect from './BubbleEffect';
import FireworksEffect from './FireworksEffect';

interface InkTankGaugeProps {
    current: number;
    target: number;
    lastFollowAt: number | null;
}

const INK_COLOR = '#32E675';
const TANK_WIDTH = 64;
const TANK_HEIGHT = 120;

/**
 * インクタンク型のフォロワーゲージ。フォローが来たらインクが波打ち、目標に届いたら花火を出す。
 * 泡と花火は画面（vw / vh）基準で動くため、ゲージではなく最も近い position 指定の祖先（サイドパネル全体）を覆う
 */
const InkTankGauge: React.FC<InkTankGaugeProps> = ({current, target, lastFollowAt}) => {
    const ratio = target > 0 ? Math.min(1, Math.max(0, current / target)) : 0;
    const reached = current >= target;

    // 表示した時点の値は演出の対象にしない（オーバーレイを読み込み直すたびに演出が出ないように）
    const [initialFollowAt] = useState(lastFollowAt);
    const [initiallyReached] = useState(reached);
    const newFollowAt = lastFollowAt !== null && lastFollowAt !== initialFollowAt ? lastFollowAt : null;

    return (
        <div className="w-[250px] flex items-center justify-center gap-4 py-3" data-testid="ink-tank-gauge">
            <div
                className="relative overflow-hidden"
                style={{
                    width: TANK_WIDTH,
                    height: TANK_HEIGHT,
                    borderRadius: '18px 18px 24px 24px',
                    border: '4px solid rgba(255, 255, 255, 0.85)',
                    backgroundColor: 'rgba(0, 0, 0, 0.6)',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
                }}
                role="meter"
                aria-label="フォロワー目標"
                aria-valuemin={0}
                aria-valuemax={target}
                aria-valuenow={current}
            >
                <motion.div
                    className="absolute left-0 right-0 bottom-0"
                    style={{backgroundColor: INK_COLOR}}
                    initial={false}
                    animate={{height: `${ratio * 100}%`}}
                    transition={{type: 'spring', stiffness: 60, damping: 14}}
                    data-testid="ink-level"
                    data-ratio={ratio}
                >
                    {/* インクの表面。フォローのたびに key が変わり、波打つ動きを最初から再生する */}
                    <motion.svg
                        key={newFollowAt ?? 'idle'}
                        className="absolute left-0 -top-2"
                        width={TANK_WIDTH * 2}
                        height={10}
                        viewBox="0 0 128 10"
                        initial={{x: 0, scaleY: newFollowAt ? 2.5 : 1}}
                        animate={{x: -TANK_WIDTH, scaleY: 1}}
                        transition={{
                            x: {duration: newFollowAt ? 0.8 : 3, repeat: Infinity, ease: 'linear'},
                            scaleY: {duration: 2, ease: 'easeOut'},
                        }}
                        aria-hidden
                    >
                        <path d="M0 5 Q16 0 32 5 T64 5 T96 5 T128 5 V10 H0 Z" fill={INK_COLOR}/>
                    </motion.svg>
                </motion.div>
                {/* タンクのつや */}
                <div className="absolute top-2 left-2 w-2 h-16 rounded-full bg-white/30"/>
            </div>

            <div className="text-white drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">
                <p className="text-gray-300" style={{fontSize: '14px'}}>フォロワー目標</p>
                <p className="font-bold tabular-nums" style={{fontSize: '30px', color: reached ? INK_COLOR : undefined}}>
                    {current.toLocaleString()}
                    <span className="text-gray-300" style={{fontSize: '18px'}}> / {target.toLocaleString()}</span>
                </p>
            </div>

            <BubbleEffect trigger={newFollowAt}/>
            <FireworksEffect trigger={reached && !initiallyReached}/>
        </div>
    );
};

export default InkTankGauge;
