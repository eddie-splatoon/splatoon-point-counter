import { act, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ScreenStampData } from '../lib/screenStampTypes';

import ScreenStampOverlay from './ScreenStampOverlay';

import type { ReactNode } from 'react';

vi.mock('axios');
// 消えるときのアニメーションが jsdom では終わらないので、motion を単純な要素に置き換える
vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
  motion: {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    div: ({ initial, animate, exit, transition, children, ...props }: Record<string, unknown>) => <div {...props}>{children as ReactNode}</div>,
  },
}));
const mockedAxios = vi.mocked(axios);

const NOW = 1_700_000_000_000;
let data: ScreenStampData;
let poll: (() => void) | undefined;

const stamp = (timestamp: number, overrides = {}) => ({ id: 1, stampId: 'nice', label: 'ナイス', imageUrl: null, timestamp, ...overrides });

describe('ScreenStampOverlay', () => {
  beforeEach(() => {
    mockedAxios.get.mockReset();
    mockedAxios.get.mockImplementation(async (url: string) =>
      url === '/api/screen-stamp' ? { data, status: 200 } : { data: { fontFamily: 'FOT-Kurokane Std' }, status: 200 });
    poll = undefined;
    vi.spyOn(global, 'setInterval').mockImplementation(((fn: () => void, ms: number) => {
      if (ms === 500) poll = fn;
      return 0;
    }) as unknown as typeof setInterval);
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not show the stamp that was already shown when the page opened', async () => {
    data = { current: stamp(NOW - 500), serverTime: NOW };
    render(<ScreenStampOverlay layout="landscape" />);
    await waitFor(() => expect(mockedAxios.get).toHaveBeenCalledWith('/api/screen-stamp', expect.anything()));
    await act(async () => poll?.());
    expect(screen.queryByTestId('screen-stamp')).not.toBeInTheDocument();
  });

  it('shows a new stamp in text, and hides it after 2 seconds', async () => {
    data = { current: null, serverTime: NOW };
    render(<ScreenStampOverlay layout="landscape" />);
    await waitFor(() => expect(mockedAxios.get).toHaveBeenCalledWith('/api/screen-stamp', expect.anything()));

    data = { current: stamp(NOW), serverTime: NOW };
    await act(async () => poll?.());
    expect(await screen.findByTestId('screen-stamp')).toHaveTextContent('ナイス');
    expect(screen.getByTestId('screen-stamp-area')).toHaveStyle({ fontFamily: 'FOT-Kurokane Std' });

    vi.mocked(Date.now).mockReturnValue(NOW + 2000);
    await act(async () => poll?.());
    await waitFor(() => expect(screen.queryByTestId('screen-stamp')).not.toBeInTheDocument());
  });

  it('shows the image from the settings, and falls back to text if it fails to load', async () => {
    data = { current: null, serverTime: NOW };
    render(<ScreenStampOverlay layout="portrait" />);
    await waitFor(() => expect(mockedAxios.get).toHaveBeenCalledWith('/api/screen-stamp', expect.anything()));
    expect(screen.getByTestId('screen-stamp-area')).toHaveAttribute('data-layout', 'portrait');

    data = { current: stamp(NOW, { imageUrl: '/stamps/nice.png' }), serverTime: NOW };
    await act(async () => poll?.());
    const image = await screen.findByRole('img', { name: 'ナイス' });
    expect(image).toHaveAttribute('src', '/stamps/nice.png');

    act(() => image.dispatchEvent(new Event('error')));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByTestId('screen-stamp')).toHaveTextContent('ナイス');
  });
});
