'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

interface Sparkle {
    id: number;
    x: string; // vw
    y: string; // vh
    size: number;
    color: string;
    duration: number;
    initialRotation: number;
}

interface SparkleEffectProps {
    trigger: number | null | undefined;
}

const sparkleColors = [
    '#FFFFFF',
    '#FFFFE0', // LightYellow
    '#FFD700', // Gold
    '#87CEFA', // LightSkyBlue
];

const SparkleEffect: React.FC<SparkleEffectProps> = ({ trigger }) => {
    const [sparkles, setSparkles] = useState<Sparkle[]>([]);
    const lastTriggerRef = useRef(trigger);

    useEffect(() => {
        if (trigger && trigger !== lastTriggerRef.current) {
            lastTriggerRef.current = trigger;
            const newSparkles: Sparkle[] = [];
            const count = 100; // パーティクルの数を増やす

            for (let i = 0; i < count; i++) {
                newSparkles.push({
                    id: Math.random(),
                    x: `${Math.random() * 100}vw`,
                    y: `${Math.random() * 100}vh`,
                    size: Math.random() * 15 + 8, // 8pxから23px
                    color: sparkleColors[Math.floor(Math.random() * sparkleColors.length)],
                    duration: Math.random() * 3 + 9, // 9秒から12秒でアニメーション (+5秒)
                    initialRotation: Math.random() * 90,
                });
            }
            setSparkles(newSparkles);
        }
    }, [trigger]);
    
    return (
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
            {sparkles.map((sparkle) => (
                <motion.div
                    key={sparkle.id}
                    initial={{
                        x: sparkle.x,
                        y: sparkle.y,
                        scale: 0,
                        opacity: 0,
                        rotate: sparkle.initialRotation,
                    }}
                    animate={{
                        scale: [0, 1, 0],
                        opacity: [0, 1, 0],
                        rotate: sparkle.initialRotation + 90, // 回転アニメーションを追加
                    }}
                    transition={{
                        duration: sparkle.duration,
                        ease: 'easeInOut',
                    }}
                    onAnimationComplete={() => {
                        setSparkles(prev => prev.filter(s => s.id !== sparkle.id));
                    }}
                    style={{
                        position: 'absolute',
                        width: sparkle.size,
                        height: sparkle.size,
                        color: sparkle.color,
                    }}
                >
                    {/* 4-Point Star SVG */}
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 0 L15.27 8.73 L24 12 L15.27 15.27 L12 24 L8.73 15.27 L0 12 L8.73 8.73 Z" />
                    </svg>
                </motion.div>
            ))}
        </div>
    );
};

export default SparkleEffect;

