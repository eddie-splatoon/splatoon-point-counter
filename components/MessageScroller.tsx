'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { StreamData } from '../app/api/stream-data/route';

interface MessageScrollerProps {
    messages: StreamData['messages'];
    transitionEffect: 'fade' | 'slide';
    transitionDuration: number;  // 秒
}

const MessageScroller: React.FC<MessageScrollerProps> = ({
                                                             messages,
                                                             transitionEffect,
                                                             transitionDuration,
                                                         }) => {
    const [index, setIndex] = useState(0);

    useEffect(() => {
        if (messages.length < 2 || transitionDuration < 1) {
            setIndex(0);
            return;
        }
        const intervalId = setInterval(() => {
            setIndex((prev) => (prev + 1) % messages.length);
        }, transitionDuration * 1000);
        return () => clearInterval(intervalId);
    }, [messages, transitionDuration]);

    const current = messages[index]?.text ?? '';

    const variants = {
        fade: {
            initial: { opacity: 0 },
            animate: { opacity: 1 },
            exit: { opacity: 0 },
        },
        slide: {
            initial: { opacity: 0, y: 10 },
            animate: { opacity: 1, y: 0 },
            exit: { opacity: 0, y: -10 },
        },
    };

    return (
        <div className="relative overflow-hidden w-full h-10 flex items-center justify-center">
            <AnimatePresence mode="wait">
                <motion.p
                    key={index}
                    initial={variants[transitionEffect].initial}
                    animate={variants[transitionEffect].animate}
                    exit={variants[transitionEffect].exit}
                    transition={{ duration: 0.5, ease: 'easeInOut' }}  // アニメーション時間 500ms
                    className="absolute text-2xl font-semibold text-white drop-shadow-lg"
                    style={{ transitionProperty: 'opacity, transform' }}
                >
                    {current}
                </motion.p>
            </AnimatePresence>
        </div>
    );
};

export default MessageScroller;
