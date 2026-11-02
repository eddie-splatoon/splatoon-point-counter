import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ClipPanel from './ClipPanel';

import type { ClipRequest } from '../lib/clipTypes';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

const clip = (overrides: Partial<ClipRequest>): ClipRequest => ({
  id: 1,
  source: 'voice',
  status: 'pending',
  requestedAt: new Date(2026, 10, 2, 21, 30, 15).getTime(),
  completedAt: null,
  clipId: null,
  editUrl: null,
  error: null,
  ...overrides,
});

const history = () => screen.getByRole('list', { name: 'クリップの履歴' });

beforeEach(() => {
  vi.clearAllMocks();
  mockedAxios.get.mockResolvedValue({
    data: {
      clips: [
        clip({ id: 2, source: 'button', status: 'created', clipId: 'FunnyClip', editUrl: 'https://clips.twitch.tv/FunnyClip/edit' }),
        clip({ id: 1, status: 'failed', error: '配信していないため作れませんでした' }),
      ],
    },
    status: 200,
  });
});

describe('ClipPanel', () => {
  it('shows the history with links and failure reasons', async () => {
    render(<ClipPanel />);

    const list = await screen.findByRole('list', { name: 'クリップの履歴' });
    expect(within(list).getByRole('link', { name: 'クリップを見る' })).toHaveAttribute('href', 'https://clips.twitch.tv/FunnyClip');
    expect(within(list).getByRole('link', { name: '編集（タイトル・範囲）' })).toHaveAttribute('href', 'https://clips.twitch.tv/FunnyClip/edit');
    expect(within(list).getByText('作成済み')).toBeInTheDocument();
    expect(within(list).getByText('ボタン')).toBeInTheDocument();
    expect(within(list).getByText('声')).toBeInTheDocument();
    expect(within(list).getByText('配信していないため作れませんでした')).toBeInTheDocument();
  });

  it('shows a message when there are no clips', async () => {
    mockedAxios.get.mockResolvedValue({ data: { clips: [] }, status: 200 });
    render(<ClipPanel />);

    expect(await screen.findByText('まだクリップはありません。')).toBeInTheDocument();
  });

  it('requests a clip with the button', async () => {
    mockedAxios.post.mockResolvedValue({ data: { clip: clip({ id: 3, source: 'button' }) }, status: 200 });
    render(<ClipPanel />);
    await screen.findByRole('list', { name: 'クリップの履歴' });

    fireEvent.click(screen.getByRole('button', { name: '今クリップする' }));

    await waitFor(() => expect(mockedAxios.post).toHaveBeenCalledWith('/api/clip', { source: 'button' }));
    await waitFor(() => expect(mockedAxios.get).toHaveBeenCalledTimes(2));
  });

  it('shows an error when the request fails', async () => {
    mockedAxios.post.mockRejectedValue(new Error('down'));
    render(<ClipPanel />);
    await screen.findByRole('list', { name: 'クリップの履歴' });

    fireEvent.click(screen.getByRole('button', { name: '今クリップする' }));

    expect(await screen.findByText('クリップを依頼できませんでした。')).toBeInTheDocument();
  });

  it('deletes a clip from the history', async () => {
    mockedAxios.delete.mockResolvedValue({ data: { clips: [] }, status: 200 });
    render(<ClipPanel />);
    await screen.findByRole('list', { name: 'クリップの履歴' });

    fireEvent.click(within(history()).getAllByRole('button', { name: /のクリップを履歴から削除/ })[0]);

    await waitFor(() => expect(mockedAxios.delete).toHaveBeenCalledWith('/api/clip?id=2'));
    expect(await screen.findByText('まだクリップはありません。')).toBeInTheDocument();
  });

  it('does not offer deleting a pending request', async () => {
    mockedAxios.get.mockResolvedValue({ data: { clips: [clip({ id: 3 })] }, status: 200 });
    render(<ClipPanel />);

    expect(await within(await screen.findByRole('list', { name: 'クリップの履歴' })).findByText('作成待ち')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /のクリップを履歴から削除/ })).not.toBeInTheDocument();
  });

  it('shows an error when the history cannot be loaded', async () => {
    mockedAxios.get.mockRejectedValue(new Error('down'));
    render(<ClipPanel />);

    expect(await screen.findByText('クリップの履歴を読み込めませんでした。サーバーを確認してください。')).toBeInTheDocument();
  });
});
