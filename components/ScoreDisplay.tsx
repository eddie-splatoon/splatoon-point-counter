'use client';

import React, { useState, useEffect, useRef } from 'react';

interface ScoreDisplayProps {
    scoreLabel: string;
    scoreValue: number;
}

const ScoreDisplay: React.FC<ScoreDisplayProps> = ({ scoreLabel, scoreValue }) => {
    // ... (コードは前回提示したものと変更なし)
    const [displayValue, setDisplayValue] = useState(scoreValue);
    const [isAnimating, setIsAnimating] = useState(false);
    const prevValueRef = useRef(scoreValue);

    useEffect(() => {
        if (prevValueRef.current !== scoreValue) {
            setIsAnimating(true);
            setDisplayValue(scoreValue);
            const timer = setTimeout(() => { setIsAnimating(false); }, 500);
            prevValueRef.current = scoreValue;
            return () => clearTimeout(timer);
        }
    }, [scoreValue]);

    return (
        <div className="flex items-center space-x-4 bg-gray-900/50 p-2 rounded-lg shadow-lg">
            <span className="text-xl font-bold text-yellow-300 drop-shadow-md">{scoreLabel}</span>
            <span
                className={`text-3xl font-extrabold transition-all duration-500 ease-out ${
                    isAnimating
                        ? 'text-red-400 scale-125 drop-shadow-2xl'
                        : 'text-white scale-100'
                }`}
            >
        {displayValue.toLocaleString()}
      </span>
        </div>
    );
};

export default ScoreDisplay;