import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SalmonSessionReview } from '../lib/salmonTypes';

import SalmonReview, { niceTicks } from './SalmonReview';

import type { ReactNode } from 'react';

vi.mock('motion/react', () => ({
  motion: {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    section: ({ initial, animate, transition, children, ...props }: Record<string, unknown>) => <section {...props}>{children as ReactNode}</section>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    header: ({ initial, animate, transition, children, ...props }: Record<string, unknown>) => <header {...props}>{children as ReactNode}</header>,
  },
}));

const job = (id: number, goldenEggs: number, cleared = true, waveReached = 3, bossKills = 10) =>
  ({ id, goldenEggs, bossKills, deaths: 1, cleared, waveReached, stage: 'アラマキ砦', hazardLevel: 300 });

const review = (overrides: Partial<SalmonSessionReview> = {}): SalmonSessionReview => ({
  session: { id: 1, startedAt: new Date(2026, 10, 10, 21).getTime(), title: '夜の部' },
  totals: { jobs: 4, goldenEggs: 100, bossKills: 40, deaths: 4, clears: 3, failures: 1 },
  jobs: [job(1, 30), job(2, 12, false, 2, 24), job(3, 35), job(4, 23)],
  detailedJobs: 4,
  powerEggs: 3200,
  rescues: 9,
  goldenAssists: 5,
  jobPoints: 1500,
  maxHazardLevel: 333,
  scales: { bronze: 1, silver: 0, gold: 0 },
  firstGrade: { name: 'でんせつ', point: 400 },
  lastGrade: { name: 'でんせつ', point: 460 },
  waveFailures: [0, 1, 0],
  kings: { appeared: 2, defeated: 1 },
  bosses: [
    { boss: 'tower', selfKills: 12, teamKills: 30, appearances: 31 },
    { boss: 'mogura', selfKills: 0, teamKills: 4, appearances: 5 },
  ],
  bestJobId: 3,
  bestBossJobId: 2,
  teamHighScores: [
    { jobId: 3, jobNumber: 3, teamGoldenEggs: 128, hazardLevel: 311, cleared: true },
    { jobId: 1, jobNumber: 1, teamGoldenEggs: 110, hazardLevel: null, cleared: true },
  ],
  weapons: [{ key: 'sshooter', count: 3 }],
  newWeapons: ['pablo'],
  challenges: { done: 2, total: 3 },
  clips: 2,
  ...overrides,
});

describe('SalmonReview', () => {
  it('shows the headline numbers of the session', () => {
    render(<SalmonReview review={review()} />);

    expect(screen.getByText('2026/11/10 夜の部')).toBeInTheDocument();
    expect(screen.getByTestId('review-clear-rate')).toHaveTextContent('75%');
    expect(screen.getByText('3,200')).toBeInTheDocument();
    expect(screen.getByText('333%')).toBeInTheDocument();
    expect(screen.getByTestId('review-kings')).toHaveTextContent('オカシラ 1 / 2 撃破');
    expect(screen.getByTestId('review-outcome')).toHaveTextContent('失敗した WAVE: W1 0 回 / W2 1 回 / W3 0 回');
    expect(screen.getByTestId('review-grade')).toHaveTextContent('でんせつ 400 → でんせつ 460');
    expect(screen.getByTestId('review-best-job')).toHaveTextContent('金イクラ 35（3 バイト目・アラマキ砦）');
    expect(screen.getByTestId('review-best-boss-job')).toHaveTextContent('ベスト オオモノ 24（2 バイト目・アラマキ砦）');
    expect(screen.getByTestId('review-challenges')).toHaveTextContent('お題 2 / 3 達成');
    expect(screen.getByTestId('review-clips')).toHaveTextContent('クリップ 2 本');
  });

  it('lists the totals with the rescues next to the bosses', () => {
    render(<SalmonReview review={review()} />);
    const labels = screen.getAllByTestId('review-stat').map((tile) => tile.firstChild?.textContent);
    expect(labels).toEqual(['金イクラ', 'オオモノ', '救助', 'デス', '赤イクラ', '獲得ポイント', '最高キケン度']);
  });

  it('draws a bar per job colored by the result and labels only the best job', () => {
    render(<SalmonReview review={review()} />);

    const bars = screen.getAllByTestId('review-job-bar');
    expect(bars.map((b) => b.getAttribute('data-cleared'))).toEqual(['true', 'false', 'true', 'true']);
    const chart = screen.getByTestId('review-golden-eggs-chart');
    expect(within(chart).getByText('35')).toBeInTheDocument();
    expect(within(chart).queryByText('23')).not.toBeInTheDocument();
  });

  it('lists every boss that appeared with the team kills and appearances', () => {
    render(<SalmonReview review={review()} />);

    const bosses = within(screen.getByTestId('review-bosses')).getAllByRole('listitem');
    expect(bosses[0]).toHaveTextContent('タワー12チーム 30 / 出現 31');
    expect(bosses[1]).toHaveTextContent('モグラ0チーム 4 / 出現 5');
  });

  it('shows the high scores of the team golden eggs', () => {
    render(<SalmonReview review={review()} />);

    const scores = within(screen.getByTestId('review-team-high-scores')).getAllByRole('listitem');
    expect(scores[0]).toHaveTextContent('11283 バイト目・311%');
    expect(scores[1]).toHaveTextContent('21101 バイト目');
  });

  it('shows the weapons and the weapon card progress', () => {
    render(<SalmonReview review={review()} />);

    expect(within(screen.getByTestId('review-weapons')).getByText('3 回')).toBeInTheDocument();
    expect(screen.getByTestId('review-new-weapons')).toHaveTextContent('ブキ埋めカード +1');
  });

  it('shows dashes for the imported numbers when no job was imported', () => {
    render(<SalmonReview review={review({ detailedJobs: 0, maxHazardLevel: null, bosses: [], teamHighScores: [], kings: { appeared: 0, defeated: 0 }, challenges: null, clips: 0 })} />);

    expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(4);
    expect(screen.getAllByText('イカリング3から取り込んだバイトがありません')).toHaveLength(2);
    expect(screen.queryByTestId('review-kings')).not.toBeInTheDocument();
    expect(screen.queryByTestId('review-challenges')).not.toBeInTheDocument();
  });

  it('notes that the imported numbers cover only part of the jobs', () => {
    render(<SalmonReview review={review({ detailedJobs: 2 })} />);
    expect(screen.getAllByText('取り込んだ 2 件の合計')).toHaveLength(2);
  });

  it('draws every job even on a long session', () => {
    const jobs = Array.from({ length: 100 }, (_, i) => job(i + 1, (i % 40) + 1, i % 3 !== 0));
    render(<SalmonReview review={review({ jobs, bestJobId: 40 })} />);
    expect(screen.getAllByTestId('review-job-bar')).toHaveLength(100);
  });

  it('shows at most one row of newly filled weapons with the full count', () => {
    const keys = ['sshooter', 'pablo', 'hokusai', 'bold', 'wakaba', 'sharp', 'promodeler_mg', 'nzap85', '52gal'];
    render(<SalmonReview review={review({ newWeapons: keys })} />);
    const filled = screen.getByTestId('review-new-weapons');
    expect(filled).toHaveTextContent('ブキ埋めカード +9');
    expect(within(filled).getAllByRole('img')).toHaveLength(8);
  });

  it('lays out every card in 1920x1080 for the stream by default', () => {
    render(<SalmonReview review={review()} />);
    const root = screen.getByTestId('salmon-review');
    expect(root).toHaveAttribute('data-layout', 'landscape');
    expect(root).toHaveStyle({ width: '1920px', height: '1080px' });
    expect(screen.getByTestId('review-golden-eggs-chart')).toHaveAttribute('width', '1080');
  });

  it('lays out every card in 1080x1920 for the vertical stream', () => {
    render(<SalmonReview review={review()} layout="portrait" animate={false} />);
    const root = screen.getByTestId('salmon-review');
    expect(root).toHaveAttribute('data-layout', 'portrait');
    expect(root).toHaveStyle({ width: '1080px', height: '1920px' });
    expect(screen.getByTestId('review-golden-eggs-chart')).toHaveAttribute('width', '940');
    expect(screen.getAllByTestId('review-job-bar')).toHaveLength(4);
    expect(screen.getByTestId('review-bosses')).toBeInTheDocument();
    expect(screen.getByTestId('review-team-high-scores')).toBeInTheDocument();
    expect(screen.getByTestId('review-weapons')).toBeInTheDocument();
    expect(screen.getByTestId('review-clips')).toHaveTextContent('クリップ 2 本');
  });

  it('shows a message before any job is recorded', () => {
    render(<SalmonReview review={review({ jobs: [], totals: { jobs: 0, goldenEggs: 0, bossKills: 0, deaths: 0, clears: 0, failures: 0 }, bestJobId: null, bestBossJobId: null })} />);
    expect(screen.getByText('まだバイトの記録がありません')).toBeInTheDocument();
    expect(screen.queryByTestId('review-best-boss-job')).not.toBeInTheDocument();
    expect(screen.getByTestId('review-clear-rate')).toHaveTextContent('0%');
  });
});

describe('niceTicks', () => {
  it('rounds the ticks to clean numbers', () => {
    expect(niceTicks(35)).toEqual([0, 10, 20, 30, 40]);
    expect(niceTicks(8)).toEqual([0, 2, 4, 6, 8]);
    expect(niceTicks(0)).toEqual([0]);
    // 金イクラは整数なので、小さいときも 0.5 刻みにしない
    expect(niceTicks(2)).toEqual([0, 1, 2]);
    expect(niceTicks(1)).toEqual([0, 1]);
  });
});
