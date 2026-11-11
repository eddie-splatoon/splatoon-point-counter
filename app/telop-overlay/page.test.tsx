import { render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FOLLOW_TELOP_DISPLAY_DURATION, TELOP_DISPLAY_DURATION, TelopData, TelopEffect } from '../../lib/telopTypes';

import TelopOverlayPage from './page';

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

describe('TelopOverlayPage', () => {
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

  it('celebrates a follow with fireworks', async () => {
    mockApis(makeData({ text: 'フォローありがとうございます！🥳', ageMs: 500, effect: 'follow' }));
    const { container } = render(<TelopOverlayPage />);

    expect(await screen.findByTestId('telop')).toHaveTextContent('フォローありがとうございます！🥳');
    expect(container.querySelector('.fireworks')).toBeInTheDocument();
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
});
