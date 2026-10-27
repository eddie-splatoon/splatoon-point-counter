import { act, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { CaptionData } from '../api/caption/route';

import CaptionOverlayPage from './page';

const CAPTION_DISPLAY_DURATION = 8000;

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

const NOW = 1_700_000_000_000;

const makeData = (lines: { text: string; ageMs: number }[]): CaptionData => ({
  lines: lines.map((line, i) => ({ id: i + 1, text: line.text, timestamp: NOW - line.ageMs })),
  revision: lines.length,
});

describe('CaptionOverlayPage', () => {
  beforeEach(() => {
    mockedAxios.get.mockReset();
    vi.spyOn(global, 'setInterval').mockImplementation(vi.fn());
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches /api/caption with no-cache headers', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: makeData([]), status: 200 });
    render(<CaptionOverlayPage />);

    await waitFor(() => {
      expect(mockedAxios.get).toHaveBeenCalledWith('/api/caption', expect.objectContaining({
        headers: expect.objectContaining({ 'Cache-Control': 'no-cache' }),
      }));
    });
  });

  it('shows only the latest two lines', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: makeData([
        { text: '一行目', ageMs: 3000 },
        { text: '二行目', ageMs: 2000 },
        { text: '三行目', ageMs: 1000 },
      ]),
      status: 200,
    });
    render(<CaptionOverlayPage />);

    expect(await screen.findByText('三行目')).toBeInTheDocument();
    expect(screen.getByText('二行目')).toBeInTheDocument();
    expect(screen.queryByText('一行目')).not.toBeInTheDocument();
  });

  it('hides lines older than the display duration', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: makeData([
        { text: '古い字幕', ageMs: CAPTION_DISPLAY_DURATION + 1 },
        { text: '新しい字幕', ageMs: 500 },
      ]),
      status: 200,
    });
    render(<CaptionOverlayPage />);

    expect(await screen.findByText('新しい字幕')).toBeInTheDocument();
    expect(screen.queryByText('古い字幕')).not.toBeInTheDocument();
  });

  it('renders nothing and logs when the fetch fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockedAxios.get.mockRejectedValueOnce(new Error('network'));
    const { container } = render(<CaptionOverlayPage />);

    // DOMが変化しないため waitFor ではなく、保留中の Promise を流してから検証する
    await act(async () => {});
    expect(consoleError).toHaveBeenCalledWith('Failed to fetch caption data:', expect.any(Error));
    expect(container.textContent).toBe('');
  });
});
