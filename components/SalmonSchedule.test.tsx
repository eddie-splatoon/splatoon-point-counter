import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import SalmonSchedule from './SalmonSchedule';

import type { SalmonScheduleEntry } from '../lib/salmonSchedule';

const now = Date.parse('2026-10-28T12:00:00+09:00');
const schedule: SalmonScheduleEntry = {
  kind: 'regular',
  startTime: now - 60 * 60_000,
  endTime: now + 90 * 60_000,
  stage: { name: 'ムニ・エール海洋発電所', image: 'https://example.com/stage.png' },
  weapons: ['プロモデラーMG', 'スプラスピナー', 'L3リールガン', 'リッター4K'].map((name) => ({ name, image: `https://example.com/${name}.png` })),
};

describe('SalmonSchedule', () => {
  it('shows the stage, the supplied weapons and the remaining time', () => {
    render(<SalmonSchedule schedule={schedule} now={now} />);

    expect(screen.getByText('サーモンラン')).toBeInTheDocument();
    expect(screen.getByText('ムニ・エール海洋発電所')).toBeInTheDocument();
    expect(screen.getByText('残り 1時間30分')).toBeInTheDocument();
    const weapons = within(screen.getByRole('list', { name: '支給ブキ' })).getAllByRole('img');
    expect(weapons.map((img) => img.getAttribute('alt'))).toEqual(['プロモデラーMG', 'スプラスピナー', 'L3リールガン', 'リッター4K']);
  });

  it.each([
    ['bigRun', 'ビッグラン'],
    ['teamContest', 'バイトチームコンテスト'],
  ] as const)('labels a %s', (kind, label) => {
    render(<SalmonSchedule schedule={{ ...schedule, kind }} now={now} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('says so when no schedule is running', () => {
    render(<SalmonSchedule schedule={null} now={now} />);
    expect(screen.getByText('スケジュールを取得できません')).toBeInTheDocument();
  });
});
