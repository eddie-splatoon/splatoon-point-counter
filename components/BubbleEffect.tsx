'use client';

import {motion} from 'framer-motion';
import React, {useState, useEffect, useRef} from 'react';

// Bubbleの型定義に色を追加
interface Bubble {
    id: number;
    x: number;
    y: number;
    size: number;
    duration: number;
    color: string; // 色を追加
    finalX: number; // Add finalX for pure animation
}

interface BubbleEffectProps {
    trigger: number | null | undefined;
}

// シンプルな半透明の泡の色を定義
const bubbleColors = [
    'rgba(173, 216, 230, 0.5)', // Light Blue
    'rgba(135, 206, 250, 0.4)', // Light Sky Blue
    'rgba(147, 112, 219, 0.4)', // MediumPurple
    'rgba(123, 104, 238, 0.5)', // MediumSlateBlue
    'rgba(180, 200, 250, 0.6)', // Light Steel Blue
];

const BubbleEffect: React.FC<BubbleEffectProps> = ({trigger}) => {
    const [bubbles, setBubbles] = useState<Bubble[]>([]);
    const lastTriggerRef = useRef(trigger);

    useEffect(() => {
        if (trigger && trigger !== lastTriggerRef.current) {
            lastTriggerRef.current = trigger;
            const newBubbles: Bubble[] = [];
            const count = 40;

            for (let i = 0; i < count; i++) {
                const x = Math.random() * 100;
                newBubbles.push({
                    id: Math.random(),
                    x: x,
                    y: 110, // 画面下からスタート
                    size: Math.random() * 40 + 20, // 20pxから60px
                    duration: Math.random() * 5 + 7, // 7秒から12秒
                    color: bubbleColors[Math.floor(Math.random() * bubbleColors.length)], // ランダムな色を割り当て
                    finalX: x + (Math.random() - 0.5) * 30,
                });
            }
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setBubbles(prev => [...prev, ...newBubbles]);
        }
    }, [trigger]);

    const removeBubble = (id: number) => {
        setBubbles(prev => prev.filter(b => b.id !== id));
    };

    return (
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
            {bubbles.map((bubble) => (
                <motion.div
                    key={bubble.id}
                    initial={{
                        x: `${bubble.x}vw`,
                        y: `${bubble.y}vh`,
                        opacity: 1,
                    }}
                    animate={{
                        y: '-20vh',
                        x: `${bubble.finalX}vw`, // 横に揺れる
                        opacity: 0,
                    }}
                    transition={{
                        duration: bubble.duration,
                        ease: 'linear',
                    }}
                    onAnimationComplete={() => removeBubble(bubble.id)}
                    style={{
                        position: 'absolute',
                        width: bubble.size,
                        height: bubble.size,
                        borderRadius: '50%', // 円形にする
                        backgroundColor: bubble.color, // ランダムな色を背景に適用
                        boxShadow: 'inset 0 0 10px rgba(255,255,255,0.5)', // ハイライト
                    }}
                >
                    {/* SVGは不要になったため削除 */}
                </motion.div>
            ))}
        </div>
    );
};

export default BubbleEffect;
