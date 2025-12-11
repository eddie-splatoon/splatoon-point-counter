'use client';

import React, {useState, useEffect} from 'react';

import {BurndownData} from '@/app/api/stream-data/route';

interface BurndownChartProps {
    data: BurndownData;
}

const BurndownChart: React.FC<BurndownChartProps> = ({data}) => {
    const {label, targetValue, entries} = data;

    const totalEarned = entries.reduce((sum, current) => sum + current, 0);
    let remaining = targetValue - totalEarned;
    if (remaining < 0) {
        remaining = 0;
    }
    const hasReachedZero = remaining <= 0;

    const [displayRemaining, setDisplayRemaining] = useState(remaining);
    const [isAnimating, setIsAnimating] = useState(false);

    useEffect(() => {
        // If the incoming calculated value is different from what's displayed, trigger animation.
        if (remaining !== displayRemaining) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setIsAnimating(true);
            // After the animation duration, update the display value to the new calculated value
            // and turn off the animation.
            const timer = setTimeout(() => {
                setDisplayRemaining(remaining);
                setIsAnimating(false);
            }, 500); // Animation duration

            return () => clearTimeout(timer);
        }
    }, [remaining, displayRemaining]);


    // Burn-up percentage
    const earnedPercentage = targetValue > 0 ? (totalEarned / targetValue) * 100 : 100;

    // SVG Line Chart Data Calculation
    const chartWidth = 200;
    const chartHeight = 100;
    const points = [targetValue, ...entries].reduce((acc, entry, index) => {
        if (index === 0) {
            acc.push(targetValue);
            return acc;
        }
        const lastValue = acc[acc.length - 1];
        const nextValue = lastValue - entry;
        acc.push(nextValue < 0 ? 0 : nextValue);
        return acc;
    }, [] as number[]);

    const maxDataPoints = Math.max(1, points.length - 1);
    const pointToSvgPath = (points: number[]) => {
        if (points.length === 0) return "M 0,0";
        return points.map((point, index) => {
            const x = (index / maxDataPoints) * chartWidth;
            const y = chartHeight - (point / targetValue) * chartHeight;
            return `${index === 0 ? 'M' : 'L'} ${x},${y}`;
        }).join(' ');
    };

    const chartPath = pointToSvgPath(points);

    const baseRemainingClasses = "font-extrabold tracking-tighter drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] transition-all duration-500 ease-out";
    const animationClasses = isAnimating ? 'scale-125 text-red-400' : 'scale-100';
    const zeroStateClasses = hasReachedZero && !isAnimating ? 'text-green-400' : 'text-white';


    return (
        <div
            className="w-full h-full bg-black/80 flex flex-col items-center justify-between p-4 text-white rounded-2xl shadow-2xl border-2 border-white/20">
            <div className="text-center">
                <p className="text-gray-400" style={{fontSize: '28px'}}>
                    目標: {targetValue.toLocaleString()}
                </p>
                <p className="text-gray-400" style={{fontSize: '24px'}}>
                    現在: {totalEarned.toLocaleString()}
                </p>
            </div>

            <div className="text-center">
                <p className="font-bold text-yellow-300 drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]"
                   style={{whiteSpace: 'pre-wrap', fontSize: '30px'}}>
                    {label}
                </p>
                <p className={`${baseRemainingClasses} ${isAnimating ? animationClasses : zeroStateClasses}`}
                   style={{fontSize: '58px'}}>
                    {displayRemaining.toLocaleString()}
                </p>
            </div>

            {/* Line Chart */}
            <div className="w-full p-2 rounded-lg mt-2"
                 style={{height: chartHeight, backgroundColor: 'rgba(0, 0, 0, 0.5)'}}>
                <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} width="100%" height="100%">
                    <path d={chartPath} stroke="#32E675" strokeWidth="4" fill="none" strokeLinejoin="round"
                          strokeLinecap="round"/>
                    {/* Target line */}
                    <line x1="0" y1="0" x2={chartWidth} y2="0" stroke="#FF40A0" strokeWidth="1" strokeDasharray="2,2"/>
                    {/* Zero line */}
                    <line x1="0" y1={chartHeight} x2={chartWidth} y2={chartHeight} stroke="white" strokeWidth="0.5"/>
                </svg>
            </div>

            <div className="w-full">
                <div className="w-full h-3 bg-gray-600 rounded-full overflow-hidden border-2 border-gray-500 mt-2">
                    <div
                        className="h-full bg-pink-500 transition-all duration-500 ease-in-out"
                        style={{width: `${Math.min(100, earnedPercentage)}%`}}
                    />
                </div>
                <p className="text-gray-400 mt-1 text-center" style={{fontSize: '24px'}}>
                    {Math.min(100, Math.round(earnedPercentage))}%
                </p>
            </div>
        </div>
    );
};

export default BurndownChart;