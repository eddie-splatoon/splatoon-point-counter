import { act, fireEvent, render, screen } from '@testing-library/react';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import StreamStartCard from './StreamStartCard';

import type { SalmonSummary } from '../lib/salmonTypes';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const totals = { jobs: 30, goldenEggs: 0, bossKills: 0, deaths: 0, clears: 0, failures: 0 };
const summary = (session: SalmonSummary['session']): SalmonSummary => ({ session, lastJob: null, totals, jobs: [], bossRanking: { lastJob: [], session: [] } });

beforeEach(() => {
  vi.clearAllMocks();
  mockedAxios.get.mockResolvedValue({ data: summary({ id: 25, startedAt: new Date('2026-11-16T17:00:00').getTime(), title: 'どんぴこ' }), status: 200 });
});

describe('StreamStartCard', () => {
  it('shows the current session', async () => {
    render(<StreamStartCard />);
    expect(await screen.findByText('いまのセッション: #25 11/16 17:00 どんぴこ（30 バイト）')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '今日の配信' })).toBeInTheDocument();
  });

  it('explains that a session is created on the first record', async () => {
    mockedAxios.get.mockResolvedValue({ data: summary(null), status: 200 });
    render(<StreamStartCard />);
    expect(await screen.findByText('いまのセッション: なし（最初の記録で作ります）')).toBeInTheDocument();
  });

  it('starts a new session with the title and opens the live screen', async () => {
    mockedAxios.post.mockResolvedValue({ data: {}, status: 200 });
    render(<StreamStartCard />);
    await screen.findByText(/いまのセッション: #25/);

    fireEvent.change(screen.getByLabelText('セッションのタイトル（任意）'), { target: { value: '夜のバイト' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '配信を始める' })));

    expect(mockedAxios.post).toHaveBeenCalledWith('/api/salmon/sessions', { title: '夜のバイト' });
    expect(push).toHaveBeenCalledWith('/control-panel');
  });

  it('stays on the screen with an error when the session cannot be started', async () => {
    mockedAxios.post.mockRejectedValue(new Error('500'));
    render(<StreamStartCard />);
    await screen.findByText(/いまのセッション: #25/);

    await act(async () => fireEvent.click(screen.getByRole('button', { name: '配信を始める' })));

    expect(screen.getByText('配信を始められませんでした（セッションを作れませんでした）。')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '配信を始める' })).toBeEnabled();
  });
});
