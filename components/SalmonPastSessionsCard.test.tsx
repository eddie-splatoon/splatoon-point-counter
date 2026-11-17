import { act, fireEvent, render, screen, within } from '@testing-library/react';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import SalmonPastSessionsCard from './SalmonPastSessionsCard';

import type { SalmonJob, SalmonSessionWithTotals, SalmonSummary } from '../lib/salmonTypes';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);
// 画像の書き出しは SalmonReviewDownload のテストで確かめる
vi.mock('./SalmonReviewDownload', () => ({
  default: ({ sessionId }: { sessionId?: number }) => <p>振り返りの画像: {sessionId ?? 'なし'}</p>,
}));

const totals = (overrides = {}) => ({ jobs: 0, goldenEggs: 0, bossKills: 0, deaths: 0, clears: 0, failures: 0, ...overrides });
const session = { id: 2, startedAt: new Date('2026-10-28T20:00:00').getTime(), title: '水曜の配信' };
const pastSession: SalmonSessionWithTotals = { id: 1, startedAt: new Date('2026-10-27T20:00:00').getTime(), title: '', totals: totals({ jobs: 1, goldenEggs: 40 }) };
const job = (overrides: Partial<SalmonJob> = {}): SalmonJob => ({
  id: 1, sessionId: 2, createdAt: session.startedAt, goldenEggs: 30, bossKills: 12, deaths: 1, cleared: true, waveReached: 3, stage: 'アラマキ砦', weapons: [], jobKind: null, ...overrides,
});
const summaryOf = (jobs: SalmonJob[], s: SalmonSummary['session'] = session): SalmonSummary => ({
  session: s, lastJob: jobs[0] ?? null, totals: totals({ jobs: jobs.length }), jobs, bossRanking: { lastJob: [], session: [] },
});

const mockGet = (sessions: SalmonSessionWithTotals[]) => {
  mockedAxios.get.mockImplementation(async (url: string) => {
    if (url === '/api/salmon/sessions') return { data: sessions, status: 200 };
    if (url === '/api/salmon?sessionId=1') return { data: summaryOf([job({ id: 9, sessionId: 1, goldenEggs: 40 })], pastSession), status: 200 };
    if (url === '/api/salmon?sessionId=3') return { data: summaryOf([job({ id: 30, sessionId: 3, goldenEggs: 77 })]), status: 200 };
    return { data: summaryOf([]), status: 200 };
  });
};

const selectOption = async (option: string | RegExp) => {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'セッションを選択' }));
  fireEvent.click(await screen.findByRole('option', { name: option }));
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGet([{ ...session, totals: totals() }, pastSession]);
});

describe('SalmonPastSessionsCard', () => {
  it('shows the records of a past session and makes its image', async () => {
    render(<SalmonPastSessionsCard />);
    expect(await screen.findByText('振り返りの画像: 2')).toBeInTheDocument();

    await selectOption(/#1 .*1回 \/ 金イクラ 40/);

    expect(await within(await screen.findByTestId('salmon-past-history')).findByText(/金イクラ 40/)).toBeInTheDocument();
    expect(screen.getByText('振り返りの画像: 1')).toBeInTheDocument();
  });

  it('does not list the current session', async () => {
    render(<SalmonPastSessionsCard />);
    await screen.findByText('振り返りの画像: 2');

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'セッションを選択' }));
    expect(screen.queryByRole('option', { name: /#2/ })).not.toBeInTheDocument();
  });

  it('says there are no past sessions yet', async () => {
    mockGet([{ ...session, totals: totals() }]);
    render(<SalmonPastSessionsCard />);
    expect(await screen.findByText('過去のセッションはまだありません')).toBeInTheDocument();
  });

  it('ignores a stale response when the selection changes quickly', async () => {
    mockGet([{ ...session, totals: totals() }, pastSession, { ...pastSession, id: 3, title: '三番目' }]);
    let resolveFirst: (value: unknown) => void = () => {};
    const baseGet = mockedAxios.get.getMockImplementation()!;
    mockedAxios.get.mockImplementation(async (url: string) =>
      url === '/api/salmon?sessionId=1' ? new Promise((resolve) => { resolveFirst = resolve; }) : baseGet(url));
    render(<SalmonPastSessionsCard />);
    await screen.findByText('振り返りの画像: 2');

    await selectOption(/#1 /);
    await selectOption(/三番目/);
    await screen.findByText(/金イクラ 77/);
    await act(async () => resolveFirst({ data: summaryOf([job({ id: 9, sessionId: 1, goldenEggs: 40 })], pastSession), status: 200 }));

    const history = screen.getByTestId('salmon-past-history');
    expect(within(history).getByText(/金イクラ 77/)).toBeInTheDocument();
    expect(within(history).queryByText(/金イクラ 40/)).not.toBeInTheDocument();
  });
});
