import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import BossRanking from './BossRanking';

const count = (boss: string, selfKills: number) => ({ boss, selfKills, teamKills: selfKills + 1, appearances: selfKills + 2 });

describe('BossRanking', () => {
  it('shows the top 3 of the last job and today side by side', () => {
    render(<BossRanking ranking={{
      lastJob: [count('tower', 8), count('koumori', 3)],
      session: [count('tower', 20), count('mogura', 9), count('teppan', 7), count('hebi', 2)],
    }} />);

    expect(screen.getByText('オオモノ討伐TOP3')).toBeInTheDocument();
    const lastJob = within(screen.getByTestId('boss-ranking-last-job'));
    expect(lastJob.getAllByRole('img').map((img) => img.getAttribute('alt'))).toEqual(['タワー', 'コウモリ']);
    expect(lastJob.getByText('8')).toBeInTheDocument();
    const session = within(screen.getByTestId('boss-ranking-session'));
    // 4 位以下は出さない
    expect(session.getAllByRole('img').map((img) => img.getAttribute('alt'))).toEqual(['タワー', 'モグラ', 'テッパン']);
    expect(session.getByText('20')).toBeInTheDocument();
  });

  it('shows a dash when the last job has no boss counts', () => {
    render(<BossRanking ranking={{ lastJob: [], session: [count('tower', 3)] }} />);
    expect(within(screen.getByTestId('boss-ranking-last-job')).getByText('-')).toBeInTheDocument();
  });

  it('ignores unknown bosses', () => {
    render(<BossRanking ranking={{ lastJob: [], session: [count('unknown', 9), count('hebi', 1)] }} />);
    expect(within(screen.getByTestId('boss-ranking-session')).getAllByRole('img').map((img) => img.getAttribute('alt'))).toEqual(['ヘビ']);
  });

  it('shows the boss name when the image cannot be loaded', () => {
    render(<BossRanking ranking={{ lastJob: [], session: [count('hebi', 1)] }} />);
    fireEvent.error(screen.getByAltText('ヘビ'));
    expect(screen.getByTestId('boss-name-fallback')).toHaveTextContent('ヘビ');
  });
});
