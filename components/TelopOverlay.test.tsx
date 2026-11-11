import { act, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FOLLOW_TELOP_DISPLAY_DURATION, TELOP_DISPLAY_DURATION, TelopData, TelopEffect } from '../lib/telopTypes';

import TelopOverlay from './TelopOverlay';

const TelopOverlayPage = () => <TelopOverlay layout="landscape" />;

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

const NOW = 1_700_000_000_000;

// serverTime はサーバーの時計。ブラウザの時計（Date.now = NOW）とずらして、経過時間をサーバーの時計で測ることを確かめる
const makeData = (current: { text: string; ageMs: number; followFont?: boolean; effect?: TelopEffect } | null, serverTime = NOW): TelopData => ({
  presets: [],
  current: current && { id: 1, text: current.text, followFont: current.followFont ?? true, effect: current.effect ?? null, timestamp: serverTime - current.ageMs },
  revision: current ? 1 : 0,
  serverTime,
});

// テロップと共通設定（フォント）を URL ごとに返す
const mockApis = (telop: TelopData, fontFamily = 'FOT-Kurokane Std') => {
  mockedAxios.get.mockImplementation(async (url: string) =>
    url === '/api/telop' ? { data: telop, status: 200 } : { data: { fontFamily }, status: 200 });
};

describe('TelopOverlay', () => {
  beforeEach(() => {
    mockedAxios.get.mockReset();
    vi.spyOn(global, 'setInterval').mockImplementation(vi.fn());
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches /api/telop with no-cache headers', async () => {
    mockApis(makeData(null));
    render(<TelopOverlayPage />);

    await waitFor(() => {
      expect(mockedAxios.get).toHaveBeenCalledWith('/api/telop', expect.objectContaining({
        headers: expect.objectContaining({ 'Cache-Control': 'no-cache' }),
      }));
    });
  });

  it('shows a telop that was just sent', async () => {
    mockApis(makeData({ text: 'ナイス!', ageMs: 500 }));
    render(<TelopOverlayPage />);

    expect(await screen.findByTestId('telop')).toHaveTextContent('ナイス!');
  });

  it('measures the elapsed time with the server clock even when the browser clock differs', async () => {
    mockApis(makeData({ text: 'ナイス!', ageMs: 500 }, NOW - 60_000));
    render(<TelopOverlayPage />);

    expect(await screen.findByTestId('telop')).toHaveTextContent('ナイス!');
  });

  it('uses the common font for a telop that follows it', async () => {
    mockApis(makeData({ text: 'ナイス!', ageMs: 500 }));
    render(<TelopOverlayPage />);

    await waitFor(() => expect(screen.getByTestId('telop')).toHaveStyle({ fontFamily: 'FOT-Kurokane Std' }));
  });

  it('uses the default font for a telop that does not follow the common font', async () => {
    mockApis(makeData({ text: '𠮷野家', ageMs: 500, followFont: false }));
    render(<TelopOverlayPage />);

    await waitFor(() => expect(mockedAxios.get).toHaveBeenCalledWith('/api/stream-data', expect.anything()));
    expect(await screen.findByTestId('telop')).toHaveStyle({ fontFamily: 'sans-serif' });
  });

  it('does not show a telop older than the display duration', async () => {
    mockApis(makeData({ text: '満潮きた', ageMs: TELOP_DISPLAY_DURATION }));
    render(<TelopOverlayPage />);

    await waitFor(() => expect(mockedAxios.get).toHaveBeenCalled());
    expect(screen.queryByTestId('telop')).not.toBeInTheDocument();
  });

  // setInterval を止めているので、ポーリングの 2 回目以降は登録された関数を直接呼ぶ
  const pollTelop = async () => {
    const calls = vi.mocked(setInterval).mock.calls;
    const poll = calls.find(([, ms]) => ms === 500)?.[0] as () => Promise<void>;
    await act(async () => { await poll(); });
  };

  it('celebrates a new follow with fireworks that outlast the telop', async () => {
    mockApis(makeData(null));
    const { container } = render(<TelopOverlayPage />);
    await waitFor(() => expect(mockedAxios.get).toHaveBeenCalledWith('/api/telop', expect.anything()));

    mockApis(makeData({ text: 'フォローありがとうございます！🥳', ageMs: 500, effect: 'follow' }));
    await pollTelop();
    expect(screen.getByTestId('telop')).toHaveTextContent('フォローありがとうございます！🥳');
    expect(container.querySelector('.fireworks')).toBeInTheDocument();

    // 別のテロップに置き換わっても花火は続ける
    mockApis({ ...makeData({ text: 'ナイス!', ageMs: 0 }), current: { id: 2, text: 'ナイス!', followFont: true, effect: null, timestamp: NOW } });
    await pollTelop();
    expect(screen.getByText('ナイス!')).toBeInTheDocument();
    expect(container.querySelector('.fireworks')).toBeInTheDocument();
  });

  it('does not celebrate a follow that was already shown when the overlay opened', async () => {
    mockApis(makeData({ text: 'フォローありがとうございます！🥳', ageMs: 500, effect: 'follow' }));
    const { container } = render(<TelopOverlayPage />);

    expect(await screen.findByTestId('telop')).toBeInTheDocument();
    await pollTelop();
    expect(container.querySelector('.fireworks')).not.toBeInTheDocument();
  });

  it('keeps the follow telop longer than a normal one', async () => {
    mockApis(makeData({ text: 'フォローありがとうございます！🥳', ageMs: TELOP_DISPLAY_DURATION, effect: 'follow' }));
    render(<TelopOverlayPage />);
    expect(await screen.findByTestId('telop')).toBeInTheDocument();
  });

  it('does not show the follow telop after its display duration', async () => {
    mockApis(makeData({ text: 'フォローありがとうございます！🥳', ageMs: FOLLOW_TELOP_DISPLAY_DURATION, effect: 'follow' }));
    render(<TelopOverlayPage />);

    await waitFor(() => expect(mockedAxios.get).toHaveBeenCalled());
    expect(screen.queryByTestId('telop')).not.toBeInTheDocument();
  });

  it('does not show fireworks for a normal telop', async () => {
    mockApis(makeData({ text: 'ナイス!', ageMs: 500 }));
    const { container } = render(<TelopOverlayPage />);

    await screen.findByTestId('telop');
    expect(container.querySelector('.fireworks')).not.toBeInTheDocument();
  });

  it('places the telop at the lower right of the game screen', async () => {
    mockApis(makeData({ text: 'ナイス!', ageMs: 500 }));
    render(<TelopOverlayPage />);

    await screen.findByTestId('telop');
    expect(screen.getByTestId('telop-area')).toHaveClass('items-end', 'justify-end');
    expect(screen.getByTestId('telop-area')).toHaveStyle({ paddingRight: '520px', paddingBottom: '232px' });
  });

  it('places the telop near the bottom center with a larger font in the portrait layout', async () => {
    mockApis(makeData({ text: 'ナイス!', ageMs: 500 }));
    render(<TelopOverlay layout="portrait" />);

    expect(await screen.findByTestId('telop')).toHaveStyle({ fontSize: '64px' });
    expect(screen.getByTestId('telop-area')).toHaveClass('items-center', 'justify-end');
    expect(screen.getByTestId('telop-area')).toHaveStyle({ paddingBottom: '440px' });
  });
});
