import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getDefaultSidePanelSettings } from '../lib/sidePanelTypes';

import ChallengeChecklistCard from './ChallengeChecklistCard';

import type { SidePanelSettings } from '../lib/sidePanelTypes';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

const settings = (overrides: Partial<SidePanelSettings> = {}): SidePanelSettings => ({
  ...getDefaultSidePanelSettings(),
  challenges: [
    { id: 1, text: '記録更新', done: true },
    { id: 2, text: 'WAVE 3 まで\nデス 0', done: false },
  ],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockedAxios.get.mockResolvedValue({ data: settings(), status: 200 });
  mockedAxios.post.mockResolvedValue({ data: {}, status: 200 });
});

describe('ChallengeChecklistCard', () => {
  it('shows the challenges and how many are done', async () => {
    render(<ChallengeChecklistCard />);

    expect(await screen.findByRole('checkbox', { name: '記録更新' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /WAVE 3 まで/ })).not.toBeChecked();
    expect(screen.getByText('1 / 2 達成')).toBeInTheDocument();
    // 追加・削除は準備の画面
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('checks a challenge by clicking anywhere on the row', async () => {
    render(<ChallengeChecklistCard />);

    const row = await screen.findByText(/WAVE 3 まで/);
    await act(async () => fireEvent.click(row));

    expect(screen.getByRole('checkbox', { name: /WAVE 3 まで/ })).toBeChecked();
    expect(screen.getByText('2 / 2 達成')).toBeInTheDocument();
    await waitFor(() => expect(mockedAxios.post).toHaveBeenCalledWith('/api/side-panel', settings({
      challenges: [{ id: 1, text: '記録更新', done: true }, { id: 2, text: 'WAVE 3 まで\nデス 0', done: true }],
    })));
  });

  it('keeps the other settings changed since it was opened', async () => {
    render(<ChallengeChecklistCard />);
    await screen.findByText('1 / 2 達成');
    // 開いた後に、準備の画面で切り替え秒数を変えた
    mockedAxios.get.mockResolvedValue({ data: settings({ rotateSeconds: 99 }), status: 200 });

    await act(async () => fireEvent.click(screen.getByRole('checkbox', { name: '記録更新' })));

    await waitFor(() => expect(mockedAxios.post).toHaveBeenCalledWith('/api/side-panel', expect.objectContaining({
      rotateSeconds: 99,
      challenges: [{ id: 1, text: '記録更新', done: false }, { id: 2, text: 'WAVE 3 まで\nデス 0', done: false }],
    })));
  });

  it('shows an error and the saved state when the check cannot be saved', async () => {
    mockedAxios.post.mockRejectedValue(new Error('500'));
    render(<ChallengeChecklistCard />);

    const checkbox = await screen.findByRole('checkbox', { name: /WAVE 3 まで/ });
    await act(async () => fireEvent.click(checkbox));

    expect(await screen.findByText('お題の達成を保存できませんでした。')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /WAVE 3 まで/ })).not.toBeChecked());
  });

  it('shows challenges added on the prepare screen while it stays open', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ChallengeChecklistCard />);
    await screen.findByText('1 / 2 達成');

    mockedAxios.get.mockResolvedValue({ data: settings({ challenges: [...settings().challenges, { id: 3, text: 'オオモノ 30 体', done: false }] }), status: 200 });
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });

    expect(screen.getByRole('checkbox', { name: 'オオモノ 30 体' })).toBeInTheDocument();
    expect(screen.getByText('1 / 3 達成')).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('does not undo a check with a reload that started before it was saved', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ChallengeChecklistCard />);
    await screen.findByText('1 / 2 達成');

    // 読み込み直しの応答が遅れているあいだにチェックする
    let resolveStale: (value: unknown) => void = () => {};
    mockedAxios.get.mockReturnValueOnce(new Promise((resolve) => { resolveStale = resolve; }));
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    mockedAxios.get.mockResolvedValue({ data: settings(), status: 200 });
    const checkbox = screen.getByRole('checkbox', { name: /WAVE 3 まで/ });
    await act(async () => fireEvent.click(checkbox));
    await waitFor(() => expect(mockedAxios.post).toHaveBeenCalled());
    await act(async () => resolveStale({ data: settings(), status: 200 }));

    expect(screen.getByRole('checkbox', { name: /WAVE 3 まで/ })).toBeChecked();
    vi.useRealTimers();
  });

  it('guides to the prepare screen when there are no challenges', async () => {
    mockedAxios.get.mockResolvedValue({ data: settings({ challenges: [] }), status: 200 });
    render(<ChallengeChecklistCard />);
    expect(await screen.findByText(/準備の画面で追加できます/)).toBeInTheDocument();
  });
});
