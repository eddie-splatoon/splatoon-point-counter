import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import EffectClipCard from './EffectClipCard';

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

// 履歴はダイアログで開く
const openHistory = async () => {
  render(<EffectClipCard />);
  fireEvent.click(screen.getByRole('button', { name: '履歴' }));
  return screen.findByRole('dialog', { name: /クリップの履歴/ });
};

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

describe('EffectClipCard', () => {
  it.each(['LOVE', 'STAR', 'SPARKLE', 'BUBBLE'])('shows the %s effect with PATCH only', async (name) => {
    mockedAxios.patch.mockResolvedValue({ data: {}, status: 200 });
    render(<EffectClipCard />);

    fireEvent.click(screen.getByRole('button', { name }));

    await waitFor(() => expect(mockedAxios.patch).toHaveBeenCalledWith('/api/stream-data', { event: name }));
    expect(mockedAxios.post).not.toHaveBeenCalled();
    expect(await screen.findByText(`${name} を出しました`)).toBeInTheDocument();
  });

  it('shows an error when the effect cannot be sent', async () => {
    mockedAxios.patch.mockRejectedValue(new Error('down'));
    render(<EffectClipCard />);

    fireEvent.click(screen.getByRole('button', { name: 'STAR' }));

    expect(await screen.findByText('エフェクトを出せませんでした')).toBeInTheDocument();
  });

  it('disables the effects while one is being sent', async () => {
    mockedAxios.patch.mockReturnValue(new Promise(() => {}));
    render(<EffectClipCard />);

    fireEvent.click(screen.getByRole('button', { name: 'LOVE' }));

    for (const name of ['LOVE', 'STAR', 'SPARKLE', 'BUBBLE']) {
      await waitFor(() => expect(screen.getByRole('button', { name })).toBeDisabled());
    }
    expect(screen.getByRole('button', { name: 'クリップ' })).toBeEnabled();
  });

  it('does not load the clip history until it is opened', () => {
    render(<EffectClipCard />);
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it('shows the history with links and failure reasons', async () => {
    await openHistory();

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
    await openHistory();

    expect(await screen.findByText('まだクリップはありません。')).toBeInTheDocument();
  });

  it('requests a clip with the button', async () => {
    mockedAxios.post.mockResolvedValue({ data: { clip: clip({ id: 3, source: 'button' }) }, status: 200 });
    render(<EffectClipCard />);

    fireEvent.click(screen.getByRole('button', { name: 'クリップ' }));

    await waitFor(() => expect(mockedAxios.post).toHaveBeenCalledWith('/api/clip', { source: 'button' }));
    expect(await screen.findByText(/クリップを依頼しました/)).toBeInTheDocument();
  });

  it('shows an error when the request fails', async () => {
    mockedAxios.post.mockRejectedValue(new Error('down'));
    render(<EffectClipCard />);

    fireEvent.click(screen.getByRole('button', { name: 'クリップ' }));

    expect(await screen.findByText('クリップを依頼できませんでした。')).toBeInTheDocument();
  });

  it('deletes a clip from the history', async () => {
    mockedAxios.delete.mockResolvedValue({ data: { clips: [] }, status: 200 });
    await openHistory();
    await screen.findByRole('list', { name: 'クリップの履歴' });

    fireEvent.click(within(history()).getAllByRole('button', { name: /のクリップを履歴から削除/ })[0]);

    await waitFor(() => expect(mockedAxios.delete).toHaveBeenCalledWith('/api/clip?id=2'));
    expect(await screen.findByText('まだクリップはありません。')).toBeInTheDocument();
  });

  it('does not offer deleting a pending request', async () => {
    mockedAxios.get.mockResolvedValue({ data: { clips: [clip({ id: 3 })] }, status: 200 });
    await openHistory();

    expect(await within(await screen.findByRole('list', { name: 'クリップの履歴' })).findByText('作成待ち')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /のクリップを履歴から削除/ })).not.toBeInTheDocument();
  });

  it('shows an error when the history cannot be loaded', async () => {
    mockedAxios.get.mockRejectedValue(new Error('down'));
    await openHistory();

    expect(await screen.findByText('クリップの履歴を読み込めませんでした。サーバーを確認してください。')).toBeInTheDocument();
  });
});
