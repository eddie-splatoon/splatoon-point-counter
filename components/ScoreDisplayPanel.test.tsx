import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ScoreDisplayPanel from './ScoreDisplayPanel';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

const settings = { scoreLabel: '現在のバイト評価', scoreValue: '720', autoUpdate: true };

beforeEach(() => {
  vi.clearAllMocks();
  mockedAxios.get.mockResolvedValue({ data: settings, status: 200 });
  mockedAxios.patch.mockImplementation(async (_url: string, update: unknown) => ({ data: { ...settings, ...(update as object) }, status: 200 }));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ScoreDisplayPanel', () => {
  it('shows the saved score display', async () => {
    render(<ScoreDisplayPanel />);
    await waitFor(() => expect(screen.getByLabelText('値')).toHaveValue('720'));
    expect(screen.getByLabelText('フィールド名')).toHaveValue('現在のバイト評価');
    expect(screen.getByRole('switch', { name: 'リザルトの取り込みで自動更新する' })).toBeChecked();
    expect(screen.getByRole('button', { name: '反映' })).toBeDisabled();
  });

  it('saves the edited score only when applied', async () => {
    render(<ScoreDisplayPanel />);
    await waitFor(() => expect(screen.getByLabelText('値')).toHaveValue('720'));

    fireEvent.change(screen.getByLabelText('フィールド名'), { target: { value: 'ハイスコア' } });
    fireEvent.change(screen.getByLabelText('値'), { target: { value: '264' } });
    expect(mockedAxios.patch).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '反映' })));

    expect(mockedAxios.patch).toHaveBeenCalledWith('/api/score-display', { scoreLabel: 'ハイスコア', scoreValue: '264' });
    expect(screen.getByRole('button', { name: '反映' })).toBeDisabled();
  });

  it('keeps the input while editing even when the score is updated by an import', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ScoreDisplayPanel />);
    await waitFor(() => expect(screen.getByLabelText('値')).toHaveValue('720'));

    fireEvent.change(screen.getByLabelText('値'), { target: { value: '7' } });
    mockedAxios.get.mockResolvedValue({ data: { ...settings, scoreValue: '740' }, status: 200 });
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(screen.getByLabelText('値')).toHaveValue('7');

    // 取り消すと最新の値に戻る
    fireEvent.click(screen.getByRole('button', { name: '取り消し' }));
    expect(screen.getByLabelText('値')).toHaveValue('740');
  });

  it('turns off the auto update immediately', async () => {
    render(<ScoreDisplayPanel />);
    const toggle = await screen.findByRole('switch', { name: 'リザルトの取り込みで自動更新する' });
    await act(async () => fireEvent.click(toggle));

    expect(mockedAxios.patch).toHaveBeenCalledWith('/api/score-display', { autoUpdate: false });
    expect(toggle).not.toBeChecked();
  });

  it('shows an error when the score display cannot be loaded', async () => {
    mockedAxios.get.mockRejectedValue(new Error('down'));
    render(<ScoreDisplayPanel />);
    expect(await screen.findByText(/スコア表示を読み込めませんでした/)).toBeInTheDocument();
  });
});
