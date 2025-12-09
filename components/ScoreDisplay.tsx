'use client';

import React from 'react';

interface ScoreDisplayProps {
    scoreLabel: string;
    scoreValue: string; // number から string へ変更
    fontSize: number;
}

const ScoreDisplay: React.FC<ScoreDisplayProps> = ({ scoreLabel, scoreValue, fontSize }) => {
    return (
        <div className="flex items-center space-x-4 bg-black/80 p-3 rounded-2xl shadow-2xl border-2 border-white/20 min-w-[400px]">
            <span
                className="font-bold text-yellow-300 drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] w-[150px] text-center"
                style={{
                    fontSize: `${fontSize * 0.6}px`,
                    whiteSpace: 'pre-wrap', // 改行を有効にする
                    lineHeight: 1.2,
                }}
            >
                {scoreLabel}
            </span>
            <span
                className="font-extrabold text-white drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]"
                style={{ fontSize: `${fontSize}px` }}
            >
                {scoreValue}
            </span>
        </div>
    );
};

export default ScoreDisplay;