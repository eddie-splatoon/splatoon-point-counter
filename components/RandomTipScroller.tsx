'use client';

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'motion/react';

interface RandomTipScrollerProps {
    fontSize: number;
    intervalSeconds: number;
}

const RandomTipScroller: React.FC<RandomTipScrollerProps> = ({ fontSize, intervalSeconds }) => {
    const [tips, setTips] = useState<string[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);

    // 1. TSVデータをフェッチしてパースする
    useEffect(() => {
        const fetchTips = async () => {
            try {
                const response = await axios.get('/tips.tsv');
                const tsvText: string = response.data;
                // ヘッダー行を除き、空行、タイトル行、補足説明行をフィルタリング
                const parsedTips = tsvText
                    .split('\n')
                    .slice(1) // ヘッダー行 'text' をスキップ
                    .map(line => line.trim())
                    .filter(line => line.length > 0) // 空行をフィルタリング
                    .filter(line => !line.startsWith('###')) // タイトル行をスキップ
                    .filter(line => !line.startsWith('**')); // 補足説明行をスキップ
                setTips(parsedTips);
            } catch (error) {
                console.error('Failed to fetch tips.tsv:', error);
            }
        };

        fetchTips().catch(console.error);
    }, []);

    // 2. 一定間隔でランダムなインデックスを選ぶ
    useEffect(() => {
        if (tips.length === 0) return;

        const intervalId = setInterval(() => {
            const randomIndex = Math.floor(Math.random() * tips.length);
            setCurrentIndex(randomIndex);
        }, intervalSeconds * 1000);

        return () => clearInterval(intervalId);
    }, [tips, intervalSeconds]);

    const currentTip = tips[currentIndex] ?? '';

    return (
        <div className="relative overflow-hidden w-full flex items-center justify-center" style={{ height: `${fontSize * 1.5}px` }}>
            <AnimatePresence mode="wait">
                <motion.p
                    key={currentIndex}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.5, ease: 'easeInOut' }}
                    className="absolute font-medium text-white/80 drop-shadow-lg"
                    style={{
                        fontSize: `${fontSize}px`,
                    }}
                >
                    {currentTip}
                </motion.p>
            </AnimatePresence>
        </div>
    );
};

export default RandomTipScroller;
