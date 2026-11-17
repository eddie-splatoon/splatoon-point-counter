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
  id: 1, sessionId: 2, createdAt: session.startedAt, goldenEggs: 30, bossKills: 12, deaths: 1, cleared: true, waveReached: 3, stage: 'アラマキ砦', weapons: [], jobKind: null, ...overrides,
});
const summaryOf = (jobs: SalmonJob[]): SalmonSummary => ({
  session,
  lastJob: jobs[0] ?? null,
  totals: totals({ jobs: jobs.length, goldenEggs: jobs.reduce((sum, j) => sum + j.goldenEggs, 0) }),
  jobs,
  bossRanking: { lastJob: [], session: [] },
});

const runningSchedule = (stage: string) => ({
  entries: [{ kind: 'regular', startTime: Date.now() - 60_000, endTime: Date.now() + 60 * 60_000, stage: { name: stage, image: '' }, weapons: [] }],
  fetchedAt: Date.now(),
});

const mockGet = (
  summary: SalmonSummary,
  sessions: SalmonSessionWithTotals[] = [{ ...session, totals: summary.totals }, pastSession],
  schedule: unknown = { entries: [], fetchedAt: 0 },
) => {
  mockedAxios.get.mockImplementation(async (url: string) => {
    if (url === '/api/salmon-schedule') return { data: schedule, status: 200 };
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

const renderLoaded = async () => {
  render(<SalmonRunPanel />);
  await screen.findByRole('button', { name: 'リザルトを取り込む' });
};

// 手入力のダイアログを開く
const openManual = async () => {
  fireEvent.click(screen.getByRole('button', { name: '手入力' }));
  return screen.findByRole('dialog', { name: /バイトを手で記録/ });
};

describe('SalmonRunPanel', () => {
  it('shows the current session, the totals and that there are no records yet', async () => {
    await renderLoaded();

    expect(screen.getByText('#2 水曜の配信')).toBeInTheDocument();
    expect(screen.getByText('記録がありません')).toBeInTheDocument();
    expect(screen.getByText(/まだ取り込んでいません/)).toBeInTheDocument();
  });

  it('explains that a session is created on the first record', async () => {
    mockGet({ ...summaryOf([]), session: null }, []);
    await renderLoaded();

    expect(screen.getByText('セッションは最初の記録で作ります')).toBeInTheDocument();
  });

  it('shows today\'s totals with the last job and the three newest records', async () => {
    const jobs = [4, 3, 2, 1].map((id) => job({ id, goldenEggs: 10 * id, cleared: id !== 4, waveReached: 2 }));
    mockGet({ ...summaryOf(jobs), totals: totals({ jobs: 4, goldenEggs: 1055, bossKills: 561, deaths: 14, clears: 3, failures: 1 }) });
    await renderLoaded();

    const tiles = screen.getByTestId('salmon-totals');
    expect(tiles).toHaveTextContent('金イクラ1,055前回 40');
    expect(tiles).toHaveTextContent('クリア3 / 4前回 WAVE2 失敗');
    const recent = screen.getByTestId('salmon-recent');
    expect(within(recent).getAllByRole('listitem')).toHaveLength(3);
    expect(within(recent).getAllByRole('listitem')[0]).toHaveTextContent(/^4WAVE2 失敗金 40 · オオモノ 12 · デス 1/);
    expect(screen.getByRole('button', { name: 'すべての記録（4）と修正・削除' })).toBeInTheDocument();
  });

  it('keeps the weapon palette closed until it is asked for', async () => {
    await renderLoaded();
    expect(screen.queryByRole('group', { name: '支給ブキ' })).not.toBeInTheDocument();

    const dialog = await openManual();
    expect(within(dialog).queryByRole('group', { name: '支給ブキ' })).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'ブキを選ぶ' }));
    expect(within(dialog).getByRole('group', { name: '支給ブキ' })).toBeInTheDocument();
  });

  it('records a cleared job by hand and keeps the stage for the next one', async () => {
    mockedAxios.post.mockResolvedValue({ data: summaryOf([job()]), status: 200 });
    await renderLoaded();
    await openManual();

    const recordButton = screen.getByRole('button', { name: '記録する' });
    expect(recordButton).toBeDisabled();

    fillNumbers('30', '12', '1');
    fireEvent.change(screen.getByLabelText('ステージ'), { target: { value: 'アラマキ砦' } });
    await act(async () => fireEvent.click(recordButton));

    expect(mockedAxios.post).toHaveBeenCalledWith('/api/salmon', {
      goldenEggs: 30, bossKills: 12, deaths: 1, cleared: true, waveReached: 3, stage: 'アラマキ砦', weapons: [], jobKind: 'regular',
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(within(screen.getByTestId('salmon-recent')).getByText(/金 30 · オオモノ 12/)).toBeInTheDocument();

    await openManual();
    expect(screen.getByLabelText('金イクラ')).toHaveValue(null);
    expect(screen.getByLabelText('ステージ')).toHaveValue('アラマキ砦');
  });

  it('records the supplied weapons, up to five', async () => {
    mockedAxios.post.mockResolvedValue({ data: summaryOf([job({ weapons: ['sshooter', 'sshooter', 'pablo', 'kuma_blaster'] })]), status: 200 });
    await renderLoaded();
    await openManual();
    fireEvent.click(screen.getByRole('button', { name: 'ブキを選ぶ' }));

    const picker = screen.getByRole('group', { name: '支給ブキ' });
    for (const name of ['スプラシューター', 'スプラシューター', 'ホクサイ', 'パブロ', 'ボールドマーカー']) {
      fireEvent.click(within(picker).getByRole('button', { name }));
    }
    // 5 つ選んだら、ほかは選べない
    expect(within(picker).getByRole('button', { name: 'クマサン印のブラスター' })).toBeDisabled();
    // 選んだブキを押すと外れる
    fireEvent.click(screen.getByRole('button', { name: '支給ブキ 3 つ目のホクサイを外す' }));
    fireEvent.click(screen.getByRole('button', { name: '支給ブキ 4 つ目のボールドマーカーを外す' }));
    fireEvent.click(within(picker).getByRole('button', { name: 'クマサン印のブラスター' }));

    fillNumbers('30', '12', '1');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '記録する' })));

    expect(mockedAxios.post).toHaveBeenCalledWith('/api/salmon', expect.objectContaining({
      weapons: ['sshooter', 'sshooter', 'pablo', 'kuma_blaster'],
    }));
    // 71 種のパレットから getByRole で何度も探すので、カバレッジ計測中の CI では既定の 5 秒を超えることがある
  }, 15_000);

  it('records a team contest job failed at WAVE 5', async () => {
    await renderLoaded();
    await openManual();

    await selectOption('バイトの種類', 'バイトチームコンテスト');
    fireEvent.click(screen.getByRole('button', { name: '失敗' }));
    await selectOption('失敗した WAVE', 'WAVE5');
    fillNumbers('30', '12', '1');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '記録する' })));

    expect(mockedAxios.post).toHaveBeenCalledWith('/api/salmon', expect.objectContaining({ cleared: false, waveReached: 5, jobKind: 'teamContest' }));
  });

  it('fills the stage from the running schedule', async () => {
    mockGet(summaryOf([]), undefined, runningSchedule('ムニ・エール海洋発電所'));
    await renderLoaded();
    await waitFor(() => expect(mockedAxios.get).toHaveBeenCalledWith('/api/salmon-schedule'));
    await act(async () => {});

    await openManual();
    expect(screen.getByLabelText('ステージ')).toHaveValue('ムニ・エール海洋発電所');
  });

  it('can still record when the schedule is unavailable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockGet(summaryOf([]));
    const baseGet = mockedAxios.get.getMockImplementation()!;
    mockedAxios.get.mockImplementation(async (url: string) => {
      if (url === '/api/salmon-schedule') throw new Error('502');
      return baseGet(url);
    });
    await renderLoaded();
    await openManual();

    expect(screen.getByLabelText('ステージ')).toHaveValue('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    ['an empty field', ['30', '', '1']],
    ['a negative number', ['30', '-1', '1']],
    ['a fraction', ['30', '12', '1.5']],
    ['a number over the limit', ['10000', '12', '1']],
  ])('does not allow recording %s', async (_, [goldenEggs, bossKills, deaths]) => {
    await renderLoaded();
    await openManual();

    fillNumbers(goldenEggs, bossKills, deaths);
    expect(screen.getByRole('button', { name: '記録する' })).toBeDisabled();
  });

  it('shows an error when recording fails and keeps the input', async () => {
    mockedAxios.post.mockRejectedValue(new Error('500'));
    await renderLoaded();
    await openManual();

    fillNumbers('30', '12', '1');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '記録する' })));

    expect(screen.getByText(/記録に失敗しました/)).toBeInTheDocument();
    expect(screen.getByLabelText('金イクラ')).toHaveValue(30);
  });

  it('deletes a job from all the records', async () => {
    mockGet(summaryOf([job({ id: 5 })]));
    mockedAxios.delete.mockResolvedValue({ data: summaryOf([]), status: 200 });
    await renderLoaded();

    fireEvent.click(screen.getByRole('button', { name: 'すべての記録（1）と修正・削除' }));
    const deleteButton = await screen.findByRole('button', { name: '記録 1 を削除' });
    await act(async () => fireEvent.click(deleteButton));

    expect(mockedAxios.delete).toHaveBeenCalledWith('/api/salmon?id=5');
    expect(within(screen.getByTestId('salmon-history')).getByText('記録がありません')).toBeInTheDocument();
  });

  it('corrects a recorded job with PATCH instead of recording a new one', async () => {
    mockGet(summaryOf([job({ id: 5, goldenEggs: 3142, stage: 'ムニ・エール海洋発電所', jobKind: 'regular' })]));
    mockedAxios.patch.mockResolvedValue({ data: summaryOf([job({ id: 5, goldenEggs: 31 })]), status: 200 });
    await renderLoaded();

    fireEvent.click(screen.getByRole('button', { name: '記録 1 を修正' }));
    expect(await screen.findByRole('dialog', { name: /記録 1 を修正/ })).toBeInTheDocument();
    expect(screen.getByLabelText('金イクラ')).toHaveValue(3142);
    expect(screen.getByLabelText('ステージ')).toHaveValue('ムニ・エール海洋発電所');

    fireEvent.change(screen.getByLabelText('金イクラ'), { target: { value: '31' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '修正を保存' })));

    expect(mockedAxios.patch).toHaveBeenCalledWith('/api/salmon', {
      id: 5, goldenEggs: 31, bossKills: 12, deaths: 1, cleared: true, waveReached: 3, stage: 'ムニ・エール海洋発電所', weapons: [], jobKind: 'regular',
    });
    expect(mockedAxios.post).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('cancels a correction', async () => {
    mockGet(summaryOf([job({ id: 5 })]));
    await renderLoaded();

    fireEvent.click(screen.getByRole('button', { name: '記録 1 を修正' }));
    fireEvent.click(await screen.findByRole('button', { name: 'やめる' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mockedAxios.patch).not.toHaveBeenCalled();
  });

  it('shows an error when the correction fails', async () => {
    mockGet(summaryOf([job({ id: 5 })]));
    mockedAxios.patch.mockRejectedValue(new Error('network'));
    await renderLoaded();

    fireEvent.click(screen.getByRole('button', { name: '記録 1 を修正' }));
    const saveButton = await screen.findByRole('button', { name: '修正を保存' });
    await act(async () => fireEvent.click(saveButton));

    expect(screen.getByText(/記録の修正に失敗しました/)).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: /記録 1 を修正/ })).toBeInTheDocument();
  });

  it('shows an error when loading fails', async () => {
    mockedAxios.get.mockRejectedValue(new Error('500'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<SalmonRunPanel />);

    expect(await screen.findByText(/記録の読み込みに失敗しました/)).toBeInTheDocument();
  });
});

describe('SalmonRunPanel result import', () => {
  const importRequest = (overrides = {}) => ({
    id: 3, status: 'pending', requestedAt: 0, startedAt: null, completedAt: null, jobId: null, playedAt: null, recordedCount: 0, captures: [], error: null, ...overrides,
  });

  const mockImportStatus = (...statuses: object[]) => {
    const baseGet = mockedAxios.get.getMockImplementation()!;
    const queue = [...statuses];
    mockedAxios.get.mockImplementation(async (url: string) => {
      if (url === '/api/salmon/import') return { data: { imports: [queue.length > 1 ? queue.shift() : queue[0]] }, status: 200 };
      return baseGet(url);
    });
  };

  it('requests an import, shows the progress and reloads the records when it is recorded', async () => {
    render(<SalmonRunPanel />);
    const button = await screen.findByRole('button', { name: 'リザルトを取り込む' });
    mockedAxios.post.mockResolvedValue({ data: { import: importRequest() }, status: 200 });
    // 記録されたら読み直すので、以降の読み込みでは記録が 1 件ある
    mockGet(summaryOf([job()]));
    mockImportStatus(importRequest({ status: 'processing' }), importRequest({ status: 'succeeded', playedAt: '2026/11/10 21:05', jobId: 1, recordedCount: 1 }));

    fireEvent.click(button);
    expect(await screen.findByText('取り込みスクリプトを待っています...')).toBeInTheDocument();
    expect(mockedAxios.post).toHaveBeenCalledWith('/api/salmon/import', {});
    expect(button).toBeDisabled();
    expect(await screen.findByText(/イカリング3から読み取り中/, {}, { timeout: 3000 })).toBeInTheDocument();
    expect(await screen.findByText('記録しました（2026/11/10 21:05 のバイト）', {}, { timeout: 3000 })).toBeInTheDocument();
    await waitFor(() => expect(within(screen.getByTestId('salmon-recent')).getByText(/金 30/)).toBeInTheDocument());
    expect(button).toBeEnabled();
  });

  it('shows how many jobs were recorded including the missed ones', async () => {
    render(<SalmonRunPanel />);
    const button = await screen.findByRole('button', { name: 'リザルトを取り込む' });
    mockedAxios.post.mockResolvedValue({ data: { import: importRequest({ status: 'processing' }) }, status: 200 });
    mockImportStatus(importRequest({ status: 'succeeded', playedAt: '2026/11/10 21:05', jobId: 4, recordedCount: 3 }));

    fireEvent.click(button);
    expect(await screen.findByText('取りこぼしを含めて 3 件記録しました（最新は 2026/11/10 21:05 のバイト）', {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it('shows why the import failed', async () => {
    render(<SalmonRunPanel />);
    const button = await screen.findByRole('button', { name: 'リザルトを取り込む' });
    mockedAxios.post.mockResolvedValue({ data: { import: importRequest({ status: 'processing' }) }, status: 200 });
    mockImportStatus(importRequest({ status: 'failed', error: 'iPhone ミラーリングが見つかりません' }));

    fireEvent.click(button);
    expect(await screen.findByText('取り込めませんでした: iPhone ミラーリングが見つかりません', {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it('shows when the last import was and which job it was', async () => {
    const completedAt = new Date(2026, 10, 10, 20, 47).getTime();
    mockGet(summaryOf([job({ id: 2 }), job({ id: 1 })]));
    mockImportStatus(importRequest({ id: 1, status: 'succeeded', completedAt, jobId: 2, recordedCount: 1 }));
    render(<SalmonRunPanel />);

    expect(await screen.findByText(/最後の取り込み 20:47（2 バイト目）/)).toBeInTheDocument();
  });

  it('shows an error when the request cannot be sent', async () => {
    render(<SalmonRunPanel />);
    mockedAxios.post.mockRejectedValue(new Error('500'));
    fireEvent.click(await screen.findByRole('button', { name: 'リザルトを取り込む' }));
    expect(await screen.findByText('取り込みを依頼できませんでした。サーバーを確認してください。')).toBeInTheDocument();
  });
});
