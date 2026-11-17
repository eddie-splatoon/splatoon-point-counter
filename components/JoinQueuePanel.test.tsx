import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import JoinQueuePanel, { JoinHistoryCard, JoinStreamerRatingCard } from './JoinQueuePanel';

import type { JoinQueuePanelView } from '../lib/joinQueueTypes';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

const view = (overrides: Partial<JoinQueuePanelView> = {}): JoinQueuePanelView => ({
  open: true,
  current: null,
  entries: [
    { position: 1, userId: '1', userName: 'ViewerA', rating: { tier: 8, points: 820, note: null }, unreadable: false, joinedAt: 1, ratedAt: 1 },
    { position: 2, userId: '2', userName: 'ViewerB', rating: { tier: 4, points: 3, note: 'たつじん+3 ではなく、たつじん 3 として読みました' }, unreadable: false, joinedAt: 2, ratedAt: 2 },
    { position: 3, userId: '3', userName: 'ViewerC', rating: null, unreadable: true, joinedAt: 3, ratedAt: 3 },
  ],
  streamer: { rating: { tier: 8, points: 820, note: null }, ratedAt: 0, source: 'record' },
  room: { estimate: 206, counted: 3, unknown: 1, wild: 0, stale: 1, lowest: 88, lowerTier: 1 },
  shiftStart: 2,
  recommended: { practice: 90, normal: 205, challenge: 333 },
  reconnectedAt: null,
  history: [],
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

  it('shows the room estimate in one line and the details when opened', async () => {
    render(<JoinQueuePanel />);

    expect(await screen.findByText('約 205%（でんせつ 225 相当）')).toBeInTheDocument();
    expect(screen.getByText(/配信者より低い称号の人が 1 人います/)).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'おすすめのキケン度' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /部屋の推定キケン度/ }));
    expect(screen.getByText('3 人で計算・不明 1 人を除く・古い評価 1 人')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'おすすめのキケン度' })).toHaveTextContent(
      '練習: 90%（たつじん 50 相当）通常: 205%（でんせつ 225 相当）腕試し: 333%（でんせつ 865 相当）');
    // ViewerA（ratedAt 1）はシフトの開始（2）より前
    expect(screen.getAllByText('シフトが替わる前の評価（古い）')).toHaveLength(1);
  });

  it('shows the streamer rating on the prepare screen', async () => {
    render(<JoinStreamerRatingCard />);

    expect(await screen.findByText('取り込んだ記録')).toBeInTheDocument();
    // 配信者（ratedAt 0）はシフトの開始（2）より前
    expect(screen.getByText('シフトが替わる前の評価（古い）')).toBeInTheDocument();
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
  });

  it('sets the streamer rating and goes back to the record', async () => {
    mockedAxios.post.mockResolvedValue({
      data: view({ streamer: { rating: { tier: 7, points: 50, note: null }, ratedAt: 5, source: 'manual' } }), status: 200,
    });
    render(<JoinStreamerRatingCard />);

    fireEvent.change(await screen.findByLabelText('配信者の評価'), { target: { value: 'たつじん+3 50' } });
    fireEvent.click(screen.getByRole('button', { name: '入れる' }));
    await waitFor(() => expect(mockedAxios.post).toHaveBeenCalledWith('/api/join-queue', { action: 'streamer', rating: 'たつじん+3 50' }));
    fireEvent.click(await screen.findByRole('button', { name: '取り込んだ記録に戻す' }));
    await waitFor(() => expect(mockedAxios.post).toHaveBeenCalledWith('/api/join-queue', { action: 'streamer', rating: null }));
  });

  it('shows an error when the streamer rating cannot be read', async () => {
    mockedAxios.post.mockRejectedValue(new Error('400'));
    render(<JoinStreamerRatingCard />);

    fireEvent.change(await screen.findByLabelText('配信者の評価'), { target: { value: 'あいうえお' } });
    fireEvent.click(screen.getByRole('button', { name: '入れる' }));
    expect(await screen.findByText('配信者の評価を読めませんでした（例: でんせつ820）。')).toBeInTheDocument();
  });

  it('announces a private job', async () => {
    mockedAxios.post.mockResolvedValue({ data: view(), status: 200 });
    render(<JoinQueuePanel />);

    fireEvent.click(await screen.findByRole('button', { name: 'プラベのお知らせ' }));
    await waitFor(() => expect(mockedAxios.post).toHaveBeenCalledWith('/api/join-queue', { action: 'announce', kind: 'private' }));
    expect(await screen.findByText(/チャットに書き込んで読み上げます/)).toBeInTheDocument();
  });

  it('says the estimate is unavailable when nobody has a known rating', async () => {
    mockedAxios.get.mockResolvedValue({
      data: view({ streamer: null, room: { estimate: null, counted: 0, unknown: 1, wild: 3, stale: 0, lowest: null, lowerTier: 0 }, recommended: null }),
      status: 200,
    });
    render(<><JoinQueuePanel /><JoinStreamerRatingCard /></>);

    expect(await screen.findByText('評価がわかる人がいないので出せません。')).toBeInTheDocument();
    expect(await screen.findByText('不明（取り込んだ記録に評価がありません）')).toBeInTheDocument();
  });

  it('shows the reconnect notice and dismisses it', async () => {
    mockedAxios.get.mockResolvedValue({ data: view({ reconnectedAt: Date.parse('2026-11-17T09:05:00Z') }), status: 200 });
    mockedAxios.post.mockResolvedValue({ data: view(), status: 200 });
    render(<JoinQueuePanel />);

    expect(await screen.findByText(/に Twitch に再接続しました（その間の参加は受け付けられていない可能性あり）/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '確認した' }));
    await waitFor(() => expect(mockedAxios.post).toHaveBeenCalledWith('/api/join-queue', { action: 'dismissReconnect' }));
  });

  it('shows the counts of past windows', async () => {
    mockedAxios.get.mockResolvedValue({
      data: view({ history: [{ openedAt: Date.parse('2026-11-16T09:00:00Z'), closedAt: Date.parse('2026-11-16T10:00:00Z'), joined: 4, called: 3, repeated: 1 }] }),
      status: 200,
    });
    render(<JoinHistoryCard />);

    const table = await screen.findByRole('table', { name: 'これまでの受付' });
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent(/431$/);
  });

  it('calls the next person', async () => {
    mockedAxios.post.mockResolvedValue({
      data: view({ current: { userId: '1', userName: 'ViewerA', rating: { tier: 8, points: 820, note: null }, unreadable: false, joinedAt: 1, ratedAt: 1 }, entries: [] }),
      status: 200,
    });
    render(<JoinQueuePanel />);

    fireEvent.click(await screen.findByRole('button', { name: '次の人を呼ぶ' }));
    await waitFor(() => expect(mockedAxios.post).toHaveBeenCalledWith('/api/join-queue', { action: 'next' }));
    expect(within(await screen.findByTestId('join-current')).getByText('ViewerA')).toBeInTheDocument();
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

    fireEvent.click(await screen.findByRole('button', { name: '受付を終わる' }));
    expect(mockedAxios.post).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: '終了する' }));
    await waitFor(() => expect(mockedAxios.post).toHaveBeenCalledWith('/api/join-queue', { action: 'close' }));
    expect(await screen.findByRole('button', { name: '受付を始める' })).toBeInTheDocument();
  });

  it('opens the queue', async () => {
    mockedAxios.get.mockResolvedValue({ data: view({ open: false, entries: [] }), status: 200 });
    mockedAxios.post.mockResolvedValue({ data: view({ entries: [] }), status: 200 });
    render(<JoinQueuePanel />);

    fireEvent.click(await screen.findByRole('button', { name: '受付を始める' }));
    await waitFor(() => expect(mockedAxios.post).toHaveBeenCalledWith('/api/join-queue', { action: 'open' }));
    expect(await screen.findByText('受付中 · 列 0 人')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '次の人を呼ぶ' })).toBeDisabled();
  });

  it('shows only the start button while closed', async () => {
    mockedAxios.get.mockResolvedValue({ data: view({ open: false, entries: [] }), status: 200 });
    render(<JoinQueuePanel />);

    expect(await screen.findByText('受付していません')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '次の人を呼ぶ' })).not.toBeInTheDocument();
    expect(screen.queryByText(/部屋の推定キケン度/)).not.toBeInTheDocument();
  });

  it('shows an error when the queue cannot be loaded', async () => {
    mockedAxios.get.mockRejectedValue(new Error('500'));
    render(<JoinQueuePanel />);

    expect(await screen.findByText('受付の列を読み込めませんでした。サーバーを確認してください。')).toBeInTheDocument();
  });
});
