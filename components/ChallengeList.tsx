'use client';

import {motion} from 'motion/react';
import React, {useState} from 'react';

import {Challenge} from '../lib/sidePanelTypes';

interface ChallengeListProps {
    challenges: Challenge[];
}

const STAMP_COLOR = '#FF40A0';

const doneMap = (challenges: Challenge[]) => Object.fromEntries(challenges.map((c) => [c.id, c.done]));

/**
 * 本日のお題。達成したお題にはインクのハンコ風スタンプを押す。
 * スタンプの演出は done が false → true に変わった瞬間だけ（表示した時点で達成済みのものや、ポーリングでは再生しない）
 */
const ChallengeList: React.FC<ChallengeListProps> = ({challenges}) => {
    const key = challenges.map((c) => `${c.id}:${c.done}`).join(',');
    const [prev, setPrev] = useState({key, done: doneMap(challenges)});
    const [stamping, setStamping] = useState<number[]>([]);
    // 前回の状態と比べ、レンダー中に state を調整する（React の「props の変化に合わせて state を調整する」パターン）
    if (prev.key !== key) {
        const done = doneMap(challenges);
        const newlyDone = challenges.filter((c) => c.done && prev.done[c.id] === false).map((c) => c.id);
        setStamping((ids) => [...ids.filter((id) => done[id]), ...newlyDone]);
        setPrev({key, done});
    }

    if (challenges.length === 0) return null;

    const clearedCount = challenges.filter((c) => c.done).length;

    return (
        <div className="w-[250px] bg-black/80 text-white rounded-2xl shadow-2xl border-2 border-white/20 p-3" data-testid="challenge-list">
            <div className="flex justify-between items-baseline">
                <p className="font-bold" style={{color: STAMP_COLOR, fontSize: '20px'}}>本日のお題</p>
                <p className="text-gray-400 tabular-nums" style={{fontSize: '14px'}}>{clearedCount} / {challenges.length}</p>
            </div>
            <ul className="mt-2 space-y-2">
                {challenges.map((challenge) => (
                    <li key={challenge.id} className="relative flex items-center gap-2 min-h-[36px] pr-12" data-done={challenge.done}>
                        <span
                            className="shrink-0 w-4 h-4 rounded-full border-2"
                            style={{borderColor: challenge.done ? STAMP_COLOR : 'rgba(255,255,255,0.6)', backgroundColor: challenge.done ? STAMP_COLOR : 'transparent'}}
                            aria-hidden
                        />
                        <span className={challenge.done ? 'text-gray-400' : undefined} style={{fontSize: '16px', lineHeight: 1.3}}>
                            {challenge.text}
                        </span>
                        {challenge.done && (
                            <motion.span
                                className="absolute right-0 top-1/2 font-bold border-2 rounded-md px-1"
                                style={{color: STAMP_COLOR, borderColor: STAMP_COLOR, fontSize: '13px', y: '-50%'}}
                                initial={stamping.includes(challenge.id) ? {scale: 2.5, opacity: 0, rotate: -30} : false}
                                animate={{scale: 1, opacity: 0.9, rotate: -12}}
                                transition={{type: 'spring', stiffness: 400, damping: 12}}
                                data-testid={`stamp-${challenge.id}`}
                                data-animated={stamping.includes(challenge.id)}
                            >
                                達成
                            </motion.span>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default ChallengeList;
