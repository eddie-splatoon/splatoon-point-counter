import React, { useState, useEffect } from 'react';
import { StreamData } from '../pages/api/stream-data'; // APIの型定義を利用

interface MessageScrollerProps {
    messages: StreamData['messages'];
    transitionEffect: string;
    transitionDuration: number;
}

const MessageScroller: React.FC<MessageScrollerProps> = ({
                                                             messages,
                                                             transitionEffect,
                                                             transitionDuration,
                                                         }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isTransitioning, setIsTransitioning] = useState(false);

    // メッセージを定期的に切り替える処理
    useEffect(() => {
        if (messages.length === 0) return;

        const interval = setInterval(() => {
            // トランジションを開始
            setIsTransitioning(true);

            // トランジション時間を考慮して、次のメッセージに切り替え
            setTimeout(() => {
                setCurrentIndex((prevIndex) => (prevIndex + 1) % messages.length);
                setIsTransitioning(false);
            }, 500); // エフェクトの時間（ここでは0.5秒と仮定）
        }, transitionDuration * 1000); // 指定された秒数ごとに実行

        return () => clearInterval(interval);
    }, [messages, transitionDuration]);

    const currentMessage = messages[currentIndex]?.text || '';

    // エフェクトに応じたクラス
    const transitionClasses = isTransitioning
        ? {
        fade: 'opacity-0',
        slide: 'opacity-0 transform -translate-y-4',
    }[transitionEffect] || 'opacity-0'
        : {
        fade: 'opacity-100',
        slide: 'opacity-100 transform translate-y-0',
    }[transitionEffect] || 'opacity-100';


    return (
        <div className="relative overflow-hidden w-full h-10 flex items-center justify-center">
        <p
            className={`absolute text-2xl font-semibold text-white transition-all duration-500 ease-in-out ${transitionClasses}`}
    style={{ transitionProperty: 'opacity, transform' }}
>
    {currentMessage}
    </p>
    </div>
);
};

export default MessageScroller;