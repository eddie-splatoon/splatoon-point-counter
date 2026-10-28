import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import SalmonRunPanel from './SalmonRunPanel';

import type { SalmonJob, SalmonSessionWithTotals, SalmonSummary } from '../lib/salmonTypes';


vi.mock('axios');
const mockedAxios = vi.mocked(axios);

const totals = (overrides = {}) => ({ jobs: 0, goldenEggs: 0, bossKills: 0, deaths: 0, clears: 0, failures: 0, ...overrides });
const session = { id: 2, startedAt: new Date('2026-10-28T20:00:00').getTime(), title: '水曜の配信' };
const pastSession: SalmonSessionWithTotals = { id: 1, startedAt: new Date('2026-10-27T20:00:00').getTime(), title: '', totals: totals({ jobs: 1, goldenEggs: 40 }) };
const job = (overrides: Partial<SalmonJob> = {}): SalmonJob => ({
  id: 1, sessionId: 2, createdAt: session.startedAt, goldenEggs: 30, bossKills: 12, deaths: 1, cleared: true, waveReached: 3, stage: 'アラマキ砦', ...overrides,
});
const summaryOf = (jobs: SalmonJob[]): SalmonSummary => ({
  session,
  lastJob: jobs[0] ?? null,
  totals: totals({ jobs: jobs.length, goldenEggs: jobs.reduce((sum, j) => sum + j.goldenEggs, 0) }),
  jobs,
});

const mockGet = (summary: SalmonSummary, sessions: SalmonSessionWithTotals[] = [{ ...session, totals: summary.totals }, pastSession]) => {
  mockedAxios.get.mockImplementation(async (url: string) => {
    if (url === '/api/salmon/sessions') return { data: sessions, status: 200 };
    if (url === `/api/salmon?sessionId=${pastSession.id}`) return { data: { ...summaryOf([job({ id: 9, sessionId: 1, goldenEggs: 40 })]), session: pastSession }, status: 200 };
    return { data: summary, status: 200 };
  });
};

const fillNumbers = (goldenEggs: string, bossKills: string, deaths: string) => {
  fireEvent.change(screen.getByLabelText('金イクラ'), { target: { value: goldenEggs } });
  fireEvent.change(screen.getByLabelText('オオモノ'), { target: { value: bossKills } });
  fireEvent.change(screen.getByLabelText('デス'), { target: { value: deaths } });
};

const selectOption = async (label: string, option: string | RegExp) => {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: label }));
  fireEvent.click(await screen.findByRole('option', { name: option }));
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGet(summaryOf([]));
});

describe('SalmonRunPanel', () => {
  it('shows the current session and an empty history', async () => {
    render(<SalmonRunPanel />);

    expect(await screen.findByText(/今のセッション: #2 .* 水曜の配信/)).toBeInTheDocument();
    expect(within(screen.getByTestId('salmon-history')).getByText('記録がありません')).toBeInTheDocument();
  });

  it('explains that a session is created on the first record', async () => {
    mockGet({ ...summaryOf([]), session: null }, []);
    render(<SalmonRunPanel />);

    expect(await screen.findByText('今のセッション（最初の記録で自動作成）')).toBeInTheDocument();
    expect(screen.getByText('過去のセッションはまだありません')).toBeInTheDocument();
  });

  it('records a cleared job and clears the number fields', async () => {
    mockedAxios.post.mockResolvedValue({ data: summaryOf([job()]), status: 200 });
    render(<SalmonRunPanel />);
    await screen.findByText(/今のセッション/);

    const recordButton = screen.getByRole('button', { name: '記録' });
    expect(recordButton).toBeDisabled();

    fillNumbers('30', '12', '1');
    fireEvent.change(screen.getByLabelText('ステージ'), { target: { value: 'アラマキ砦' } });
    await act(async () => fireEvent.click(recordButton));

    expect(mockedAxios.post).toHaveBeenCalledWith('/api/salmon', {
      goldenEggs: 30, bossKills: 12, deaths: 1, cleared: true, waveReached: 3, stage: 'アラマキ砦',
    });
    await waitFor(() => expect(within(screen.getByTestId('salmon-history')).getByText(/クリア \| 金イクラ 30/)).toBeInTheDocument());
    expect(screen.getByLabelText('金イクラ')).toHaveValue(null);
    expect(screen.getByLabelText('ステージ')).toHaveValue('アラマキ砦');
  });

  it('records the wave of a failed job', async () => {
    mockedAxios.post.mockResolvedValue({ data: summaryOf([job({ cleared: false, waveReached: 2 })]), status: 200 });
    render(<SalmonRunPanel />);
    await screen.findByText(/今のセッション/);

    fireEvent.click(screen.getByRole('button', { name: '失敗' }));
    await selectOption('失敗した WAVE', 'WAVE2');
    fillNumbers('10', '5', '3');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '記録' })));

    expect(mockedAxios.post).toHaveBeenCalledWith('/api/salmon', expect.objectContaining({ cleared: false, waveReached: 2 }));
  });

  it.each([
    ['an empty field', ['30', '', '1']],
    ['a negative number', ['30', '-1', '1']],
    ['a fraction', ['30', '12', '1.5']],
    ['a number over the limit', ['10000', '12', '1']],
  ])('does not allow recording %s', async (_, [goldenEggs, bossKills, deaths]) => {
    render(<SalmonRunPanel />);
    await screen.findByText(/今のセッション/);

    fillNumbers(goldenEggs, bossKills, deaths);
    expect(screen.getByRole('button', { name: '記録' })).toBeDisabled();
  });

  it('shows an error when recording fails', async () => {
    mockedAxios.post.mockRejectedValue(new Error('500'));
    render(<SalmonRunPanel />);
    await screen.findByText(/今のセッション/);

    fillNumbers('30', '12', '1');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '記録' })));

    expect(screen.getByText(/記録に失敗しました/)).toBeInTheDocument();
    expect(screen.getByLabelText('金イクラ')).toHaveValue(30);
  });

  it('does not report a saved job as failed when only the session list fails to refresh', async () => {
    mockedAxios.post.mockResolvedValue({ data: summaryOf([job()]), status: 200 });
    render(<SalmonRunPanel />);
    await screen.findByText(/今のセッション/);
    mockedAxios.get.mockRejectedValue(new Error('500'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    fillNumbers('30', '12', '1');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '記録' })));

    expect(screen.queryByText(/記録に失敗しました/)).not.toBeInTheDocument();
    expect(within(screen.getByTestId('salmon-history')).getByText(/金イクラ 30/)).toBeInTheDocument();
  });

  it('deletes a job from the history', async () => {
    mockGet(summaryOf([job({ id: 5 })]));
    mockedAxios.delete.mockResolvedValue({ data: summaryOf([]), status: 200 });
    render(<SalmonRunPanel />);

    const deleteButton = await screen.findByRole('button', { name: '記録 1 を削除' });
    await act(async () => fireEvent.click(deleteButton));

    expect(mockedAxios.delete).toHaveBeenCalledWith('/api/salmon?id=5');
    expect(within(screen.getByTestId('salmon-history')).getByText('記録がありません')).toBeInTheDocument();
  });

  it('starts a new session with a title and reloads', async () => {
    mockedAxios.post.mockResolvedValue({ data: {}, status: 200 });
    render(<SalmonRunPanel />);
    await screen.findByText(/今のセッション/);

    fireEvent.change(screen.getByLabelText('新しいセッションのタイトル（任意）'), { target: { value: '木曜の配信' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '新しいセッションを開始' })));

    expect(mockedAxios.post).toHaveBeenCalledWith('/api/salmon/sessions', { title: '木曜の配信' });
    await waitFor(() => expect(mockedAxios.get.mock.calls.filter(([url]) => url === '/api/salmon')).toHaveLength(2));
  });

  it('shows the records of a past session', async () => {
    render(<SalmonRunPanel />);
    await screen.findByText(/今のセッション/);

    await selectOption('セッションを選択', /#1 .*1回 \/ 金イクラ 40/);

    expect(mockedAxios.get).toHaveBeenCalledWith('/api/salmon?sessionId=1');
    expect(await within(await screen.findByTestId('salmon-past-history')).findByText(/金イクラ 40/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /#2/ })).not.toBeInTheDocument();
  });

  it('ignores a stale response when the past session selection changes quickly', async () => {
    const sessions = [{ ...session, totals: totals() }, pastSession, { ...pastSession, id: 3, title: '三番目' }];
    mockGet(summaryOf([]), sessions);
    let resolveFirst: (value: unknown) => void = () => {};
    const baseGet = mockedAxios.get.getMockImplementation()!;
    mockedAxios.get.mockImplementation(async (url: string) => {
      if (url === '/api/salmon?sessionId=1') return new Promise((resolve) => { resolveFirst = resolve; });
      if (url === '/api/salmon?sessionId=3') return { data: { ...summaryOf([job({ id: 30, sessionId: 3, goldenEggs: 77 })]), session: sessions[2] }, status: 200 };
      return baseGet(url);
    });
    render(<SalmonRunPanel />);
    await screen.findByText(/今のセッション/);

    await selectOption('セッションを選択', /#1 /);
    await selectOption('セッションを選択', /三番目/);
    await screen.findByText(/金イクラ 77/);
    await act(async () => resolveFirst({ data: { ...summaryOf([job({ id: 9, sessionId: 1, goldenEggs: 40 })]), session: pastSession }, status: 200 }));

    const history = screen.getByTestId('salmon-past-history');
    expect(within(history).getByText(/金イクラ 77/)).toBeInTheDocument();
    expect(within(history).queryByText(/金イクラ 40/)).not.toBeInTheDocument();
  });

  it('shows an error when loading fails', async () => {
    mockedAxios.get.mockRejectedValue(new Error('500'));
    render(<SalmonRunPanel />);

    expect(await screen.findByText(/記録の読み込みに失敗しました/)).toBeInTheDocument();
  });
});
