'use client';

import React, { useState, useEffect, useRef } from 'react';
import { StreamData } from '@/app/api/stream-data/route';

interface MessageScrollerProps {
    messages: StreamData['messages'];
    transitionEffect: string;
    transitionDuration: number;
}

const TRANSITION_DURATION_MS = 500; // CSS animation duration

const MessageScroller: React.FC<MessageScrollerProps> = ({
                                                             messages,
                                                             transitionEffect,
                                                             transitionDuration,
                                                         }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isTransitioning, setIsTransitioning] = useState(false);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        // 常にタイマーをクリアして、エフェクトの再実行時に重複しないようにする
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        // messages配列が変更され、現在のインデックスが範囲外になった場合は0にリセット
        if (currentIndex >= messages.length) {
            // このstate更新は意図的なもので、propsの変更に同期するために必要
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setCurrentIndex(0);
            return; // state更新後にエフェクトが再実行されるので、ここで終了
        }

        // メッセージが1つ以下、または表示時間が無効な場合はアニメーションしない
        const shouldAnimate = messages.length > 1 && transitionDuration > 0;
        if (!shouldAnimate) {
            // インデックスが0でなければリセット
            if (currentIndex !== 0) {
                // このstate更新は意図的なもので、アニメーション停止時に状態をリセットするために必要
                setCurrentIndex(0);
            }
            return;
        }

        // --- メッセージ切り替えロジック ---

        // 1. 現在のメッセージを表示する時間
        const displayTimeMs = transitionDuration * 1000;

        // 2. 表示時間後に「非表示」トランジションを開始
        timeoutRef.current = setTimeout(() => {
            setIsTransitioning(true);

            // 3. CSSトランジションの時間後にメッセージを更新し、「表示」トランジションを開始
            timeoutRef.current = setTimeout(() => {
                setIsTransitioning(false); // 表示トランジションを開始
                setCurrentIndex((prevIndex) => (prevIndex + 1) % messages.length); // 次のメッセージへ
            }, TRANSITION_DURATION_MS);

        }, displayTimeMs);

        // コンポーネントのアンマウント時や、依存配列の変更時にタイマーをクリーンアップ
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, [messages, transitionDuration, currentIndex]); // currentIndexも依存配列に含める

    // 表示するメッセージを安全に取得
    const currentMessage = messages[currentIndex]?.text || '';

    const transitionClasses = isTransitioning
        ? { fade: 'opacity-0', slide: 'opacity-0 -translate-y-4' }[transitionEffect] || 'opacity-0'
        : { fade: 'opacity-100', slide: 'opacity-100 translate-y-0' }[transitionEffect] || 'opacity-100';

    return (
        <div className="relative overflow-hidden w-full h-10 flex items-center justify-center">
            <p
                className={`absolute text-2xl font-semibold text-white transition-all duration-500 ease-in-out drop-shadow-lg ${transitionClasses}`}
                style={{ transitionProperty: 'opacity, transform' }}
            >
                {currentMessage}
            </p>
        </div>
    );
};

export default MessageScroller;