'use client';

import {motion} from 'framer-motion';
import React, {useState, useEffect, useRef} from 'react';

// スターの型定義
interface Star {
    id: number;
    x: number; // 初期X位置 (%)
    y: number; // 初期Y位置 (%)
    size: number; // サイズ (px)
    color: string; // 色
    duration: number; // アニメーション時間 (秒)
    finalX: number; // Add finalX for pure animation
}

interface StarEffectProps {
    trigger: number | null | undefined; // イベントのタイムスタンプ
}

const starColors = [
    '#FFD700', // Gold
    '#FFA500', // Orange
    '#FFEC8B', // LightGoldenrod
    '#FFFFE0', // LightYellow
    '#FFFFFF', // White
];

const StarEffect: React.FC<StarEffectProps> = ({trigger}) => {
    const [stars, setStars] = useState<Star[]>([]);
    const lastTriggerRef = useRef(trigger);

    useEffect(() => {
        if (trigger && trigger !== lastTriggerRef.current) {
            lastTriggerRef.current = trigger;
            const newStars: Star[] = [];
            const starCount = 30;

            for (let i = 0; i < starCount; i++) {
                const x = Math.random() * 100;
                newStars.push({
                    id: Math.random(),
                    x: x,
                    y: 110,
                    size: Math.random() * 25 + 15, // 15pxから40px
                    color: starColors[Math.floor(Math.random() * starColors.length)],
                    duration: Math.random() * 3 + 9, // 9秒から12秒でアニメーション (+5秒)
                    finalX: x + (Math.random() - 0.5) * 40,
                });
            }
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setStars(prevStars => [...prevStars, ...newStars]);
        }
    }, [trigger]);

    const removeStar = (id: number) => {
        setStars(prevStars => prevStars.filter(s => s.id !== id));
    };

    return (
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
            {stars.map((star) => (
                <motion.div
                    key={star.id}
                    initial={{
                        x: `${star.x}vw`,
                        y: `${star.y}vh`,
                        opacity: 1,
                        rotate: 0,
                    }}
                    animate={{
                        y: '-20vh',
                        x: `${star.finalX}vw`,
                        opacity: 0,
                        rotate: 360,
                    }}
                    transition={{
                        duration: star.duration,
                        ease: 'linear',
                    }}
                    onAnimationComplete={() => removeStar(star.id)}
                    style={{
                        position: 'absolute',
                        width: star.size,
                        height: star.size,
                        color: star.color,
                    }}
                >
                    {/* SVG Star */}
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <path
                            d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
                    </svg>
                </motion.div>
            ))}
        </div>
    );
};

export default StarEffect;
