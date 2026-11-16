import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import JoinQueuePanel from './JoinQueuePanel';

import type { JoinQueuePanelView } from '../lib/joinQueueTypes';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

const view = (overrides: Partial<JoinQueuePanelView> = {}): JoinQueuePanelView => ({
  open: true,
  current: null,
  entries: [
    { position: 1, userId: '1', userName: 'ViewerA', rating: { tier: 8, points: 820, note: null }, unreadable: false, joinedAt: 1 },
    { position: 2, userId: '2', userName: 'ViewerB', rating: { tier: 4, points: 3, note: 'たつじん+3 ではなく、たつじん 3 として読みました' }, unreadable: false, joinedAt: 2 },
    { position: 3, userId: '3', userName: 'ViewerC', rating: null, unreadable: true, joinedAt: 3 },
  ],
  revision: 1,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockedAxios.get.mockResolvedValue({ data: view(), status: 200 });
});

describe('JoinQueuePanel', () => {
  it('shows the queue with ratings and notes', async () => {
    render(<JoinQueuePanel />);

    const list = await screen.findByRole('list', { name: '受付の列' });
    expect(within(list).getByText('でんせつ 820')).toBeInTheDocument();
    expect(within(list).getByText('たつじん+3 ではなく、たつじん 3 として読みました')).toBeInTheDocument();
    expect(within(list).getByText('不明')).toBeInTheDocument();
    expect(within(list).getByText('読めなかったので書き方を返しました')).toBeInTheDocument();
    expect(mockedAxios.get).toHaveBeenCalledWith('/api/join-queue?view=panel');
  });

  it('calls the next person', async () => {
    mockedAxios.post.mockResolvedValue({
      data: view({ current: { userId: '1', userName: 'ViewerA', rating: { tier: 8, points: 820, note: null }, unreadable: false, joinedAt: 1 }, entries: [] }),
      status: 200,
    });
    render(<JoinQueuePanel />);

    fireEvent.click(await screen.findByRole('button', { name: '次の人' }));
    await waitFor(() => expect(mockedAxios.post).toHaveBeenCalledWith('/api/join-queue', { action: 'next' }));
    expect(await screen.findByText('ViewerA')).toBeInTheDocument();
    expect(screen.getByText('まだ誰も並んでいません。')).toBeInTheDocument();
  });

  it('removes a person from the queue', async () => {
    mockedAxios.post.mockResolvedValue({ data: view(), status: 200 });
    render(<JoinQueuePanel />);

    fireEvent.click(await screen.findByRole('button', { name: 'ViewerB を列から外す' }));
    await waitFor(() => expect(mockedAxios.post).toHaveBeenCalledWith('/api/join-queue', { action: 'remove', userId: '2' }));
  });

  it('closes the queue only after confirming', async () => {
    mockedAxios.post.mockResolvedValue({ data: view({ open: false, entries: [] }), status: 200 });
    render(<JoinQueuePanel />);

    fireEvent.click(await screen.findByRole('button', { name: '受付終了' }));
    expect(mockedAxios.post).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: '終了する' }));
    await waitFor(() => expect(mockedAxios.post).toHaveBeenCalledWith('/api/join-queue', { action: 'close' }));
    expect(await screen.findByRole('button', { name: '受付開始' })).toBeInTheDocument();
  });

  it('opens the queue', async () => {
    mockedAxios.get.mockResolvedValue({ data: view({ open: false, entries: [] }), status: 200 });
    mockedAxios.post.mockResolvedValue({ data: view({ entries: [] }), status: 200 });
    render(<JoinQueuePanel />);

    fireEvent.click(await screen.findByRole('button', { name: '受付開始' }));
    await waitFor(() => expect(mockedAxios.post).toHaveBeenCalledWith('/api/join-queue', { action: 'open' }));
    expect(await screen.findByText('受付中')).toBeInTheDocument();
  });

  it('shows an error when the queue cannot be loaded', async () => {
    mockedAxios.get.mockRejectedValue(new Error('500'));
    render(<JoinQueuePanel />);

    expect(await screen.findByText('受付の列を読み込めませんでした。サーバーを確認してください。')).toBeInTheDocument();
  });
});
