// pages/api/stream-data.ts (Pages Routerの例)
import type { NextApiRequest, NextApiResponse } from 'next';

// リアルタイム通信がないため、データを一時的にインメモリで保持するストア
// 本番環境ではDBを使用してください
let streamData = {
    scoreLabel: 'ハイスコア',
    scoreValue: 580,
    messages: [
        { id: 1, text: '大会参加中！応援してね！' },
        { id: 2, text: 'チャンネル登録・高評価お願いします' },
    ],
    transitionEffect: 'fade', // transition effect: 'fade', 'slide'
    transitionDuration: 5, // seconds
};

export type StreamData = typeof streamData;

export default function handler(
    req: NextApiRequest,
    res: NextApiResponse<StreamData | { message: string }>
) {
    if (req.method === 'GET') {
        // OBS投影用画面へのデータ提供
        res.status(200).json(streamData);
    } else if (req.method === 'POST') {
        // 設定画面からのデータ更新
        const { scoreLabel, scoreValue, messages, transitionEffect, transitionDuration } = req.body;

        // データのバリデーション（簡易的）
        if (typeof scoreLabel !== 'string' || typeof scoreValue !== 'number') {
            return res.status(400).json({ message: 'Invalid score data' });
        }

        streamData = {
            scoreLabel: scoreLabel,
            scoreValue: scoreValue,
            messages: Array.isArray(messages) ? messages : streamData.messages,
            transitionEffect: transitionEffect || streamData.transitionEffect,
            transitionDuration: transitionDuration || streamData.transitionDuration,
        };

        res.status(200).json(streamData);
    } else {
        res.setHeader('Allow', ['GET', 'POST']);
        res.status(405).end(`Method ${req.method} Not Allowed`);
    }
}