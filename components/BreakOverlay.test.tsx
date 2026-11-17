import { render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BreakState } from '../lib/breakTypes';

import BreakOverlay from './BreakOverlay';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

const NOW = 1_700_000_000_000;

const mockApis = (state: BreakState, fontFamily = 'FOT-Kurokane Std') => {
  mockedAxios.get.mockImplementation(async (url: string) =>
    url === '/api/break' ? { data: state, status: 200 } : { data: { fontFamily }, status: 200 });
};

describe('BreakOverlay', () => {
  beforeEach(() => {
    mockedAxios.get.mockReset();
    vi.spyOn(global, 'setInterval').mockImplementation(vi.fn());
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows nothing when not on a break', async () => {
    mockApis({ active: false, startedAt: null, voiceHeardAt: null, serverTime: NOW });
    render(<BreakOverlay layout="landscape" />);

    await waitFor(() => expect(mockedAxios.get).toHaveBeenCalledWith('/api/break', expect.anything()));
    expect(screen.queryByTestId('break')).not.toBeInTheDocument();
  });

  it('shows the break with the elapsed time measured by the server clock', async () => {
    // サーバーの時計はブラウザより 1 分遅れているが、休憩を始めてから 3 分 5 秒
    const serverTime = NOW - 60_000;
    mockApis({ active: true, startedAt: serverTime - 185_000, voiceHeardAt: null, serverTime });
    render(<BreakOverlay layout="landscape" />);

    expect(await screen.findByTestId('break')).toHaveTextContent('休憩中');
    expect(screen.getByTestId('break')).toHaveTextContent('ちょっと待っててね🐟️');
    expect(screen.getByTestId('break-elapsed')).toHaveTextContent('3:05');
  });

  it('uses the common font setting', async () => {
    mockApis({ active: true, startedAt: NOW, voiceHeardAt: null, serverTime: NOW });
    render(<BreakOverlay layout="portrait" />);

    await waitFor(() => expect(screen.getByTestId('break-area')).toHaveStyle({ fontFamily: 'FOT-Kurokane Std' }));
  });
});
