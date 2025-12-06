'use client';

import React, { useState, useEffect, useRef } from 'react';
import { StreamData } from '../app/api/stream-data/route';

interface MessageScrollerProps {
    messages: StreamData['messages'];
    transitionEffect: string;
    transitionDuration: number;
}

// CSSアニメーションの実行時間（変更不可）
const TRANSITION_DURATION_MS = 500;

const MessageScroller: React.FC<MessageScrollerProps> = ({
                                                             messages,
                                                             transitionEffect,
                                                             transitionDuration,
                                                         }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isTransitioning, setIsTransitioning] = useState(false);

    // 現在アクティブなタイマーIDを保持するためのRef
    const timerRef = useRef<NodeJS.Timeout>();

    useEffect(() => {
        // メッセージが1つ以下、または表示時間が無効ならタイマーを設定しない
        if (messages.length < 2 || transitionDuration < 1) {
            setCurrentIndex(0);
            return;
        }

        // --- メッセージ切り替えサイクルを実行する関数 ---
        const runCycle = (durationSeconds: number) => {
            // 1. 現在のメッセージを表示する時間（durationSeconds）を待つ
            const displayTimeMs = durationSeconds * 1000;

            // 既存のタイマーをクリアしてから新しいタイマーをセット
            if (timerRef.current) clearTimeout(timerRef.current);

            timerRef.current = setTimeout(() => {
                // **タイマー発火**

                // 2. トランジションを開始 (非表示へ: 500ms)
                setIsTransitioning(true);

                // 3. CSSアニメーションの実行時間（500ms）後にメッセージを更新し、表示を再開
                const updateTimer = setTimeout(() => {
                    // コンテンツ更新
                    setCurrentIndex((prevIndex) => (prevIndex + 1) % messages.length);
                    setIsTransitioning(false); // トランジション終了 (新しいメッセージが表示されるアニメーション開始)

                    // 4. 次のサイクルを予約 (再帰呼び出し)
                    runCycle(durationSeconds);
                }, TRANSITION_DURATION_MS);

                // 次のクリーンアップに備えて、最後にセットしたタイマーIDをRefに保持
                timerRef.current = updateTimer;

            }, displayTimeMs);
        };
        // ---------------------------------------------

        // 依存配列の変更時（durationやmessagesの変更時）にサイクルを開始/リセット
        runCycle(transitionDuration);

        // クリーンアップ: コンポーネントがアンマウントされるときや依存配列が変わるときにタイマーをリセット
        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
            }
        };
    }, [messages, transitionDuration]);


    // 表示部分は変更なし
    const currentMessage = messages[currentIndex]?.text || '';
    const transitionClasses = isTransitioning
        ? { fade: 'opacity-0', slide: 'opacity-0 translate-y-4' }[transitionEffect] || 'opacity-0'
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