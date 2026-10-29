import { render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TELOP_DISPLAY_DURATION, TelopData } from '../../lib/telopTypes';

import TelopOverlayPage from './page';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

const NOW = 1_700_000_000_000;

// serverTime はサーバーの時計。ブラウザの時計（Date.now = NOW）とずらして、経過時間をサーバーの時計で測ることを確かめる
const makeData = (current: { text: string; ageMs: number } | null, serverTime = NOW): TelopData => ({
  presets: [],
  current: current && { id: 1, text: current.text, timestamp: serverTime - current.ageMs },
  revision: current ? 1 : 0,
  serverTime,
});

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
    mockedAxios.get.mockResolvedValueOnce({ data: makeData(null), status: 200 });
    render(<TelopOverlayPage />);

    await waitFor(() => {
      expect(mockedAxios.get).toHaveBeenCalledWith('/api/telop', expect.objectContaining({
        headers: expect.objectContaining({ 'Cache-Control': 'no-cache' }),
      }));
    });
  });

  it('shows a telop that was just sent', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: makeData({ text: 'ナイス!', ageMs: 500 }), status: 200 });
    render(<TelopOverlayPage />);

    expect(await screen.findByTestId('telop')).toHaveTextContent('ナイス!');
  });

  it('measures the elapsed time with the server clock even when the browser clock differs', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: makeData({ text: 'ナイス!', ageMs: 500 }, NOW - 60_000), status: 200 });
    render(<TelopOverlayPage />);

    expect(await screen.findByTestId('telop')).toHaveTextContent('ナイス!');
  });

  it('does not show a telop older than the display duration', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: makeData({ text: '満潮きた', ageMs: TELOP_DISPLAY_DURATION }), status: 200 });
    render(<TelopOverlayPage />);

    await waitFor(() => expect(mockedAxios.get).toHaveBeenCalled());
    expect(screen.queryByTestId('telop')).not.toBeInTheDocument();
  });
});
