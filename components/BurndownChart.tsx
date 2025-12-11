'use client';

import { format } from 'date-fns';
import React, {useState, useEffect} from 'react';

import {BurndownData} from '@/app/api/stream-data/route';

interface BurndownChartProps {
    data: BurndownData;
}

const BurndownChart: React.FC<BurndownChartProps> = ({data}) => {
    const {label, targetValue, entries} = data;
    
    // Sort entries by timestamp to ensure chronological order
    const sortedEntries = [...entries].sort((a, b) => a.timestamp - b.timestamp);

    const totalEarned = sortedEntries.reduce((sum, current) => sum + current.score, 0);
    let remaining = targetValue - totalEarned;
    if (remaining < 0) {
        remaining = 0;
    }
    const hasReachedZero = remaining <= 0;

    const [displayRemaining, setDisplayRemaining] = useState(remaining);
    const [isAnimating, setIsAnimating] = useState(false);

    useEffect(() => {
        if (remaining !== displayRemaining) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setIsAnimating(true);
            const timer = setTimeout(() => {
                setDisplayRemaining(remaining);
                setIsAnimating(false);
            }, 300); // Animation duration

            return () => clearTimeout(timer);
        }
    }, [remaining, displayRemaining]);

    const earnedPercentage = targetValue > 0 ? (totalEarned / targetValue) * 100 : 100;

    // --- SVG Chart Calculations ---
    const padding = { top: 5, right: 5, bottom: 20, left: 45 };
    const chartWidth = 250 - padding.left - padding.right;
    const chartHeight = 100 - padding.top - padding.bottom;
    
    const points = sortedEntries.reduce((acc, entry) => {
        const lastValue = acc.length > 0 ? acc[acc.length - 1] : targetValue;
        const nextValue = lastValue - entry.score;
        acc.push(nextValue < 0 ? 0 : nextValue);
        return acc;
    }, [targetValue] as number[]);

    const maxDataPoints = Math.max(1, points.length - 1);
    const pointToSvgPath = (p: number[]) => {
        if (p.length === 0) return "M 0,0";
        return p.map((point, index) => {
            const x = (index / maxDataPoints) * chartWidth;
            const y = chartHeight - (point / targetValue) * chartHeight;
            return `${index === 0 ? 'M' : 'L'} ${x},${y}`;
        }).join(' ');
    };
    const chartPath = pointToSvgPath(points);

    // --- Axis Calculations ---
    const yAxisLabels = [
        { value: targetValue, y: 0 },
        { value: 0, y: chartHeight },
    ];

    const formatYAxisValue = (val: number) => {
        if (targetValue < 100) return val.toLocaleString(undefined, { maximumFractionDigits: 2 });
        return `${Math.round(val / 1000)}k`;
    };

    const xAxisLabels = () => {
        if (sortedEntries.length < 2) return [];
        const first = sortedEntries[0].timestamp;
        const last = sortedEntries[sortedEntries.length - 1].timestamp;
        const middle = first + (last - first) / 2;
        
        return [
            { value: format(new Date(first), 'HH:mm:ss'), x: 0 },
            { value: format(new Date(middle), 'HH:mm:ss'), x: chartWidth / 2 },
            { value: format(new Date(last), 'HH:mm:ss'), x: chartWidth },
        ];
    };

    const baseRemainingStyle = { // Inline style to precisely control animation
        fontSize: '58px',
        fontWeight: 'extrabold', // Added for consistency
        transition: 'all 0.3s ease-out',
        textShadow: '0 0 2px rgba(0,0,0,0.8)' // Default subtle shadow
    };
    const animatedRemainingStyle = isAnimating ? {
        transform: 'scale(1.2)',
        opacity: 0.7,
        textShadow: '0 0 8px rgba(255, 64, 160, 0.7)', // Pink glow
        color: '#FF40A0' // Set explicit color for animation
    } : {};
    const zeroStateColor = hasReachedZero && !isAnimating ? 'text-green-400' : 'text-white'; // Tailwind for color


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
                <p
                   className={`${zeroStateColor}`} // Apply zero state color via tailwind
                   style={{...baseRemainingStyle, ...animatedRemainingStyle}} // Apply base and animated styles
                >
                    {displayRemaining.toLocaleString()}
                </p>
            </div>

            {/* Line Chart */}
            <div className="w-full p-2 rounded-lg mt-2"
                 style={{height: chartHeight + padding.top + padding.bottom, backgroundColor: 'rgba(0, 0, 0, 0.5)'}}>
                <svg viewBox={`0 0 ${chartWidth + padding.left + padding.right} ${chartHeight + padding.top + padding.bottom}`} width="100%" height="100%">
                    <g transform={`translate(${padding.left}, ${padding.top})`}>
                        {/* Y-Axis Labels and Lines */}
                        {yAxisLabels.map(label => (
                            <g key={label.value}>
                                <text x={-10} y={label.y + 4} fill="white" fontSize="10" textAnchor="end">{formatYAxisValue(label.value)}</text>
                                <line x1="0" y1={label.y} x2={chartWidth} y2={label.y} stroke="white" strokeWidth="0.5" strokeOpacity="0.2" strokeDasharray="2,2" />
                            </g>
                        ))}
                        {/* Intermediate Line */}
                        <line x1="0" y1={chartHeight / 2} x2={chartWidth} y2={chartHeight / 2} stroke="white" strokeWidth="0.5" strokeOpacity="0.2" strokeDasharray="2,2" />
                        {/* X-Axis Labels */}
                        {xAxisLabels().map(label => (
                             <text key={label.x} x={label.x} y={chartHeight + 15} fill="white" fontSize="10" textAnchor="middle">{label.value}</text>
                        ))}

                        <path d={chartPath} stroke="#32E675" strokeWidth="4" fill="none" strokeLinejoin="round"
                              strokeLinecap="round"/>
                    </g>
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
