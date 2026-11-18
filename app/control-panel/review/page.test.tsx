import { render, screen } from '@testing-library/react';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ReviewPage from './page';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

beforeEach(() => {
    vi.clearAllMocks();
    mockedAxios.get.mockImplementation(async (url: string) => {
        if (url === '/api/salmon') return { data: { session: { id: 2, startedAt: 0, title: '' }, lastJob: null, totals: { jobs: 0 }, jobs: [], bossRanking: { lastJob: [], session: [] } }, status: 200 };
        if (url === '/api/salmon/sessions') return { data: [], status: 200 };
        if (url === '/api/weapon-card') return { data: { startedAt: 0, total: 71, obtained: [] }, status: 200 };
        if (url.startsWith('/api/join-queue')) return { data: { history: [], streamer: null, shiftStart: null }, status: 200 };
        return { data: {}, status: 200 };
    });
});

describe('ReviewPage', () => {
    it('shows the cards used after a stream, in order', async () => {
        render(<ReviewPage />);
        await screen.findByText('過去のセッションはまだありません');

        expect(screen.getAllByRole('heading', { level: 6 }).map((heading) => heading.textContent)).toEqual([
            'サーモンランの振り返りの画像',
            'サーモンランの過去のセッション',
            'オールランダム ブキ埋め',
            '新しいカード',
            'これまでの受付（28 日）',
        ]);
        expect(screen.getByText(/現在のセッションの振り返り/)).toBeInTheDocument();
    });
});
