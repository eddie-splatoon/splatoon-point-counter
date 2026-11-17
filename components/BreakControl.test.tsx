import { act, fireEvent, render, screen } from '@testing-library/react';
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BREAK_LONG_MS, BreakState } from '../lib/breakTypes';

import BreakControl from './BreakControl';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

const NOW = 1_700_000_000_000;
const idle: BreakState = { active: false, startedAt: null, voiceHeardAt: null, serverTime: NOW };
const onBreak = (elapsedMs: number, voiceHeardAt: number | null = null): BreakState =>
  ({ active: true, startedAt: NOW - elapsedMs, voiceHeardAt, serverTime: NOW });

const renderWith = async (state: BreakState) => {
  mockedAxios.get.mockResolvedValue({ data: state, status: 200 });
  render(<BreakControl />);
  await act(async () => {});
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(global, 'setInterval').mockImplementation(vi.fn());
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  document.title = 'Control Panel';
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('BreakControl', () => {
  it('starts a break', async () => {
    await renderWith(idle);
    mockedAxios.post.mockResolvedValue({ data: onBreak(0), status: 200 });

    await act(async () => fireEvent.click(screen.getByRole('button', { name: /休憩する/ })));

    expect(mockedAxios.post).toHaveBeenCalledWith('/api/break', { action: 'start' });
    expect(screen.getByTestId('break-active')).toHaveTextContent('休憩中 0:00');
    expect(document.title).toBe('☕ 休憩中 0:00 | Control Panel');
  });

  it('ends a break and restores the title', async () => {
    await renderWith(onBreak(65_000));
    expect(screen.getByTestId('break-active')).toHaveTextContent('休憩中 1:05');
    mockedAxios.post.mockResolvedValue({ data: idle, status: 200 });

    await act(async () => fireEvent.click(screen.getByRole('button', { name: '休憩を終わる' })));

    expect(mockedAxios.post).toHaveBeenCalledWith('/api/break', { action: 'end' });
    expect(screen.getByRole('button', { name: /休憩する/ })).toBeInTheDocument();
    expect(document.title).toBe('Control Panel');
  });

  it('warns when the break is long', async () => {
    await renderWith(onBreak(BREAK_LONG_MS));

    expect(screen.getByTestId('break-active')).toHaveAttribute('data-attention', 'true');
    expect(screen.getByText(/10 分を超えました/)).toBeInTheDocument();
    expect(document.title).toBe('⚠️ 休憩中 10:00 | Control Panel');
  });

  it('warns when the streamer was heard during the break', async () => {
    await renderWith(onBreak(120_000, NOW));

    expect(screen.getByTestId('break-active')).toHaveAttribute('data-attention', 'true');
    expect(screen.getByText(/話し声を拾いました/)).toBeInTheDocument();
  });

  it('does not warn during a short quiet break', async () => {
    await renderWith(onBreak(120_000));

    expect(screen.getByTestId('break-active')).toHaveAttribute('data-attention', 'false');
  });

  it('shows an error when the request fails', async () => {
    await renderWith(idle);
    mockedAxios.post.mockRejectedValue(new Error('network'));

    await act(async () => fireEvent.click(screen.getByRole('button', { name: /休憩する/ })));

    expect(screen.getByRole('alert')).toHaveTextContent('休憩中にできませんでした。');
  });
});
