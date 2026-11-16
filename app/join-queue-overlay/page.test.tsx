import { render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import JoinQueueOverlayPage from './page';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

const respond = (queue: unknown) =>
  mockedAxios.get.mockImplementation(async (url: string) =>
    url === '/api/join-queue' ? { data: queue, status: 200 } : { data: { fontFamily: 'FOT-Kurokane Std' }, status: 200 });

describe('JoinQueueOverlayPage', () => {
  beforeEach(() => {
    mockedAxios.get.mockReset();
    vi.spyOn(global, 'setInterval').mockImplementation(vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows how to join, the current person and the queue while open', async () => {
    respond({ open: true, current: 'ViewerA', entries: [{ position: 1, userName: '<b>ViewerB</b>' }], hazard: null, revision: 3 });
    const { container } = render(<JoinQueueOverlayPage />);

    expect(await screen.findByRole('region', { name: '参加受付' })).toHaveTextContent('チャットに !参加 でんせつ820');
    expect(screen.getByText('ViewerA')).toBeInTheDocument();
    // 表示名は文字として出す（HTML として解釈しない）
    expect(screen.getByRole('list', { name: '受付の列' })).toHaveTextContent('1.<b>ViewerB</b> さん');
    expect(container.querySelector('b')).toBeNull();
    await waitFor(() => expect(container.firstChild).toHaveStyle({ fontFamily: 'FOT-Kurokane Std' }));
  });

  it('shows the estimated hazard level of the room without anyone\'s rating', async () => {
    respond({ open: true, current: null, entries: [{ position: 1, userName: 'ViewerA' }], hazard: { value: 260, unknown: 1, wild: 2 }, revision: 1 });
    render(<JoinQueueOverlayPage />);

    expect(await screen.findByText('この部屋の推定キケン度 約 260%（自己申告からの目安）。不明 1 人を除く・野良 2 人分は含まない')).toBeInTheDocument();
  });

  it('shows the first 10 people and how many more', async () => {
    const entries = Array.from({ length: 12 }, (_, i) => ({ position: i + 1, userName: `Viewer${i + 1}` }));
    respond({ open: true, current: null, entries, hazard: null, revision: 1 });
    render(<JoinQueueOverlayPage />);

    expect(await screen.findByText('ほか 2 人')).toBeInTheDocument();
    expect(screen.queryByText('Viewer11 さん')).not.toBeInTheDocument();
  });

  it('shows nothing while the queue is closed', async () => {
    respond({ open: false, current: null, entries: [], hazard: null, revision: 0 });
    render(<JoinQueueOverlayPage />);

    await waitFor(() => expect(mockedAxios.get).toHaveBeenCalledWith('/api/join-queue', expect.anything()));
    expect(screen.queryByRole('region', { name: '参加受付' })).not.toBeInTheDocument();
  });
});
