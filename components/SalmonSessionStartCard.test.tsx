import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import SalmonSessionStartCard from './SalmonSessionStartCard';

import type { SalmonSummary } from '../lib/salmonTypes';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

const totals = { jobs: 3, goldenEggs: 0, bossKills: 0, deaths: 0, clears: 0, failures: 0 };
const summary = (session: SalmonSummary['session']): SalmonSummary => ({ session, lastJob: null, totals, jobs: [], bossRanking: { lastJob: [], session: [] } });

beforeEach(() => {
  vi.clearAllMocks();
  mockedAxios.get.mockResolvedValue({ data: summary({ id: 2, startedAt: new Date('2026-10-28T20:00:00').getTime(), title: '水曜の配信' }), status: 200 });
});

describe('SalmonSessionStartCard', () => {
  it('shows the current session', async () => {
    render(<SalmonSessionStartCard />);
    expect(await screen.findByText(/今のセッション: #2 .* 水曜の配信（3 回）/)).toBeInTheDocument();
  });

  it('explains that a session is created on the first record', async () => {
    mockedAxios.get.mockResolvedValue({ data: summary(null), status: 200 });
    render(<SalmonSessionStartCard />);
    expect(await screen.findByText('今のセッション: なし（最初の記録で自動作成）')).toBeInTheDocument();
  });

  it('starts a new session with a title and reloads', async () => {
    mockedAxios.post.mockResolvedValue({ data: {}, status: 200 });
    render(<SalmonSessionStartCard />);
    await screen.findByText(/今のセッション: #2/);

    fireEvent.change(screen.getByLabelText('新しいセッションのタイトル（任意）'), { target: { value: '木曜の配信' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '新しいセッションを開始' })));

    expect(mockedAxios.post).toHaveBeenCalledWith('/api/salmon/sessions', { title: '木曜の配信' });
    await waitFor(() => expect(mockedAxios.get).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText('新しいセッションのタイトル（任意）')).toHaveValue('');
  });

  it('shows an error when the session cannot be started', async () => {
    mockedAxios.post.mockRejectedValue(new Error('500'));
    render(<SalmonSessionStartCard />);
    await screen.findByText(/今のセッション: #2/);

    await act(async () => fireEvent.click(screen.getByRole('button', { name: '新しいセッションを開始' })));
    expect(screen.getByText('セッションの開始に失敗しました。')).toBeInTheDocument();
  });
});
