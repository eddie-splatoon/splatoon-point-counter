'use client';

import React, {useState, useEffect, useRef} from 'react';

interface ScoreDisplayProps {
    scoreLabel: string;
    scoreValue: string;
    fontSize: number;
}

const ScoreDisplay: React.FC<ScoreDisplayProps> = ({scoreLabel, scoreValue, fontSize}) => {
    const [displayValue, setDisplayValue] = useState(scoreValue);
    const [isAnimating, setIsAnimating] = useState(false);
    const prevValueRef = useRef(scoreValue);

    useEffect(() => {
        if (prevValueRef.current !== scoreValue) {
            setIsAnimating(true);
            const timer = setTimeout(() => {
                setIsAnimating(false);
                setDisplayValue(scoreValue);
            }, 500); // Animation duration
            prevValueRef.current = scoreValue;
            return () => clearTimeout(timer);
        }
    }, [scoreValue]);

    const baseClasses = "font-extrabold drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] transition-all duration-500 ease-out";
    const animationClasses = isAnimating ? 'scale-125 text-red-400' : 'scale-100 text-white';

    return (
        <div
            className="flex items-center space-x-4 bg-black/80 p-3 rounded-2xl shadow-2xl border-2 border-white/20 min-w-[400px]">
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
                className={`${baseClasses} ${animationClasses}`}
                style={{fontSize: `${fontSize}px`}}
            >
                {isAnimating ? prevValueRef.current : displayValue}
            </span>
        </div>
    );
};

export default ScoreDisplay;