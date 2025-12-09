'use client';

import {motion} from 'framer-motion';
import React, {useState, useEffect, useRef} from 'react';

// ハートの型定義
interface Heart {
    id: number;
    x: number; // 初期X位置 (% a)
    y: number; // 初期Y位置 (% a)
    size: number; // サイズ (px)
    color: string; // 色 (rgba)
    duration: number; // アニメーション時間 (秒)
}

interface HeartEffectProps {
    trigger: number | null | undefined; // イベントのタイムスタンプ
}

const heartColors = [
    'rgba(255, 105, 180, 0.8)', // Pink
    'rgba(255, 20, 147, 0.7)',  // DeepPink
    'rgba(255, 182, 193, 0.8)', // LightPink
    'rgba(219, 112, 147, 0.7)', // PaleVioletRed
    'rgba(255, 99, 71, 0.8)',   // Tomato
];

const HeartEffect: React.FC<HeartEffectProps> = ({trigger}) => {
    const [hearts, setHearts] = useState<Heart[]>([]);
    const lastTriggerRef = useRef(trigger);

    useEffect(() => {
        // triggerが新しく、かつnull/undefinedでない場合にエフェクトを発動
        if (trigger && trigger !== lastTriggerRef.current) {
            lastTriggerRef.current = trigger;
            const newHearts: Heart[] = [];
            const heartCount = 30; // 一度に生成するハートの数

            for (let i = 0; i < heartCount; i++) {
                newHearts.push({
                    id: Math.random(),
                    x: Math.random() * 100, // 画面の幅の0%から100%
                    y: 110, // 画面の下からスタート
                    size: Math.random() * 30 + 20, // 20pxから50pxのサイズ
                    color: heartColors[Math.floor(Math.random() * heartColors.length)],
                    duration: Math.random() * 3 + 9, // 9秒から12秒でアニメーション (+5秒)
                });
            }
            setHearts(prevHearts => [...prevHearts, ...newHearts]);
        }
    }, [trigger]);

    const removeHeart = (id: number) => {
        setHearts(prevHearts => prevHearts.filter(h => h.id !== id));
    };

    return (
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
            {hearts.map((heart) => (
                <motion.div
                    key={heart.id}
                    initial={{
                        x: `${heart.x}vw`,
                        y: `${heart.y}vh`,
                        opacity: 1,
                    }}
                    animate={{
                        y: '-20vh', // 画面の上外へ
                        x: `${heart.x + (Math.random() - 0.5) * 40}vw`, // 横に少し揺れながら
                        opacity: 0,
                    }}
                    transition={{
                        duration: heart.duration,
                        ease: 'linear',
                    }}
                    onAnimationComplete={() => removeHeart(heart.id)}
                    style={{
                        position: 'absolute',
                        width: heart.size,
                        height: heart.size,
                        color: heart.color,
                    }}
                >
                    {/* SVG Heart */}
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <path
                            d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                    </svg>
                </motion.div>
            ))}
        </div>
    );
};

export default HeartEffect;
