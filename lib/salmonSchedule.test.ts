import { describe, expect, it } from 'vitest';

import { formatRemaining, parseScheduleResults, pickCurrentSchedule, type SalmonScheduleEntry } from './salmonSchedule';

const weapons = [1, 2, 3, 4].map((i) => ({ name: `ブキ${i}`, image: `https://example.com/w${i}.png` }));
const result = (overrides: Record<string, unknown> = {}) => ({
  start_time: '2026-10-27T17:00:00+09:00',
  end_time: '2026-10-29T09:00:00+09:00',
  boss: { id: 'x', name: 'ジョー' },
  stage: { id: 0, name: 'ムニ・エール海洋発電所', image: 'https://example.com/stage.png' },
  weapons,
  is_big_run: false,
  ...overrides,
});

describe('parseScheduleResults', () => {
  it('converts the API results', () => {
    expect(parseScheduleResults({ results: [result()] }, false)).toEqual([{
      kind: 'regular',
      startTime: Date.parse('2026-10-27T17:00:00+09:00'),
      endTime: Date.parse('2026-10-29T09:00:00+09:00'),
      stage: { name: 'ムニ・エール海洋発電所', image: 'https://example.com/stage.png' },
      weapons,
    }]);
  });

  it('marks big runs and team contests', () => {
    expect(parseScheduleResults({ results: [result({ is_big_run: true })] }, false)[0].kind).toBe('bigRun');
    expect(parseScheduleResults({ results: [result()] }, true)[0].kind).toBe('teamContest');
  });

  it.each([
    ['an invalid start time', { start_time: 'soon' }],
    ['a missing stage', { stage: null }],
    ['a stage without an image', { stage: { name: 'ステージ' } }],
    ['a malformed weapon', { weapons: [...weapons.slice(0, 3), { name: 'ブキ' }] }],
  ])('skips a result with %s', (_, overrides) => {
    expect(parseScheduleResults({ results: [result(overrides), result()] }, false)).toHaveLength(1);
  });

  it.each([null, {}, { results: 'x' }, 'text'])('returns no entries for %j', (body) => {
    expect(parseScheduleResults(body, false)).toEqual([]);
  });
});

describe('pickCurrentSchedule', () => {
  const entry = (kind: SalmonScheduleEntry['kind'], startTime: number, endTime: number): SalmonScheduleEntry => ({
    kind, startTime, endTime, stage: { name: kind, image: '' }, weapons: [],
  });

  it('picks the schedule running now', () => {
    const entries = [entry('regular', 0, 100), entry('regular', 100, 200)];
    expect(pickCurrentSchedule(entries, 100)).toBe(entries[1]);
  });

  it('prefers a team contest, then a big run, over the regular schedule', () => {
    const regular = entry('regular', 0, 100);
    const bigRun = entry('bigRun', 0, 100);
    const teamContest = entry('teamContest', 0, 100);
    expect(pickCurrentSchedule([regular, bigRun], 50)).toBe(bigRun);
    expect(pickCurrentSchedule([regular, bigRun, teamContest], 50)).toBe(teamContest);
  });

  it('returns null when nothing is running', () => {
    expect(pickCurrentSchedule([entry('regular', 0, 100)], 100)).toBeNull();
  });
});

describe('formatRemaining', () => {
  const minute = 60_000;

  it.each([
    [30 * minute, '残り 30分'],
    [30 * minute - 1, '残り 30分'],
    [90 * minute, '残り 1時間30分'],
    [26 * 60 * minute, '残り 1日2時間'],
    [-minute, '残り 0分'],
  ])('formats %d ms as %s', (remaining, text) => {
    expect(formatRemaining(1_000_000 + remaining, 1_000_000)).toBe(text);
  });
});
