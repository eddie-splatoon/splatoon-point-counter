import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import SalmonStats from './SalmonStats';

const totals = { jobs: 10, goldenEggs: 1234, bossKills: 98, deaths: 15, clears: 8, failures: 2 };
const lastJob = { id: 10, sessionId: 1, createdAt: 0, goldenEggs: 23, bossKills: 12, deaths: 2, cleared: true, waveReached: 3, stage: '' };

const row = (label: string) => screen.getByRole('rowheader', { name: label }).closest('tr') as HTMLElement;

describe('SalmonStats', () => {
  it('shows the last job next to the session totals', () => {
    render(<SalmonStats lastJob={lastJob} totals={totals} />);

    expect(within(row('金イクラ')).getAllByRole('cell').map((c) => c.textContent)).toEqual(['23', '1,234']);
    expect(within(row('オオモノ')).getAllByRole('cell').map((c) => c.textContent)).toEqual(['12', '98']);
    expect(within(row('デス')).getAllByRole('cell').map((c) => c.textContent)).toEqual(['2', '15']);
    expect(screen.getByText('8クリア')).toBeInTheDocument();
    expect(screen.getByText('2失敗')).toBeInTheDocument();
    expect(screen.getByText('前回: クリア')).toBeInTheDocument();
  });

  it('shows the wave of a failed last job', () => {
    render(<SalmonStats lastJob={{ ...lastJob, cleared: false, waveReached: 2 }} totals={totals} />);
    expect(screen.getByText('前回: WAVE2 失敗')).toBeInTheDocument();
  });

  it('shows placeholders before the first job', () => {
    render(<SalmonStats lastJob={null} totals={{ jobs: 0, goldenEggs: 0, bossKills: 0, deaths: 0, clears: 0, failures: 0 }} />);

    expect(within(row('金イクラ')).getAllByRole('cell').map((c) => c.textContent)).toEqual(['-', '0']);
    expect(screen.queryByText(/前回:/)).not.toBeInTheDocument();
  });
});
