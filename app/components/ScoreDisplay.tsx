import React, {useState, useEffect, useRef} from 'react';
import {StreamData} from '../pages/api/stream-data'; // APIの型定義を利用

interface ScoreDisplayProps {
    scoreLabel: string;
    scoreValue: number;
}

const ScoreDisplay: React.FC<ScoreDisplayProps> = ({scoreLabel, scoreValue}) => {
    const [displayValue, setDisplayValue] = useState(scoreValue);
    const [isAnimating, setIsAnimating] = useState(false);
    const prevValueRef = useRef(scoreValue);

    // scoreValueが変更されたときのアニメーション処理
    useEffect(() => {
        if (prevValueRef.current !== scoreValue) {
            // 値が変わったらアニメーションを開始
            setIsAnimating(true);
            // 実際はスムーズなカウントアップアニメーションも検討すべきですが、
            // ここでは値の変更と同時にエフェクトをかけます
            setDisplayValue(scoreValue);

            const timer = setTimeout(() => {
                setIsAnimating(false);
            }, 500); // 0.5秒間エフェクトを適用

            prevValueRef.current = scoreValue;
            return () => clearTimeout(timer);
        }
    }, [scoreValue]);

    return (
        <div className="flex items-center space-x-4 bg-gray-900/50 p-2 rounded-lg">
            <span className="text-xl font-bold text-yellow-300">{scoreLabel}</span>
            <span
                className={`text-3xl font-extrabold transition-all duration-500 ease-out ${
                    isAnimating
                        ? 'text-red-400 scale-125 drop-shadow-lg'
                        : 'text-white scale-100'
                }`}
            >
        {displayValue.toLocaleString()}
      </span>
        </div>
    );
};

export default ScoreDisplay;