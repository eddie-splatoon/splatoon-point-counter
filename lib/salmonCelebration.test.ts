// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';

import { __TEST_ONLY_setDb, openDb } from './db';
import { addJob, parseJobDetails, startSession } from './salmon';
import { MIN_SELF_BOSS_KILLS, MIN_SELF_GOLDEN_EGGS, MIN_TEAM_GOLDEN_EGGS, detectAchievements, formatCelebration } from './salmonCelebration';
import { NewSalmonJob, SalmonJobDetails } from './salmonTypes';

const job = (overrides: Partial<NewSalmonJob> = {}): NewSalmonJob =>
  ({ goldenEggs: 20, bossKills: 10, deaths: 1, cleared: true, waveReached: 3, stage: 'アラマキ砦', weapons: [], jobKind: 'regular', ...overrides });

// 既定はオオモノを倒しきっていない（allBosses にならない）
const details = (teamGoldenEggs: number | null, bosses = [{ boss: 'tower', appearances: 3, teamKills: 2, selfKills: 1 }]): SalmonJobDetails => {
  const parsed = parseJobDetails({ teamGoldenEggs, waves: [], players: [], bosses });
  if (typeof parsed === 'string') throw new Error(parsed);
  return parsed;
};

let playedAt = 0;
const add = (overrides: Partial<NewSalmonJob> = {}, jobDetails: SalmonJobDetails | null = details(100)) =>
  addJob(job(overrides), Date.now(), jobDetails ? `2026/11/11 20:${String(playedAt++).padStart(2, '0')}` : null, jobDetails);

beforeEach(() => {
  __TEST_ONLY_setDb(openDb(':memory:'));
  playedAt = 0;
  startSession();
});

describe('detectAchievements', () => {
  it('does not celebrate records on the first job of the session', () => {
    const first = add({ goldenEggs: 50, bossKills: 30 }, details(200));
    expect(detectAchievements(first.id)).toEqual([]);
  });

  it('celebrates records that beat the earlier jobs of the session and reach the thresholds', () => {
    add({ goldenEggs: 30, bossKills: 20 }, details(130));
    const best = add({ goldenEggs: MIN_SELF_GOLDEN_EGGS, bossKills: MIN_SELF_BOSS_KILLS }, details(MIN_TEAM_GOLDEN_EGGS));
    expect(detectAchievements(best.id)).toEqual([
      { kind: 'selfGoldenEggs', value: MIN_SELF_GOLDEN_EGGS },
      { kind: 'selfBossKills', value: MIN_SELF_BOSS_KILLS },
      { kind: 'teamGoldenEggs', value: MIN_TEAM_GOLDEN_EGGS },
    ]);
  });

  it('ignores records below the thresholds and ties', () => {
    add({ goldenEggs: 10, bossKills: 10 }, details(100));
    const low = add({ goldenEggs: MIN_SELF_GOLDEN_EGGS - 1, bossKills: MIN_SELF_BOSS_KILLS - 1 }, details(MIN_TEAM_GOLDEN_EGGS - 1));
    expect(detectAchievements(low.id)).toEqual([]);

    add({ goldenEggs: 40, bossKills: 30 }, details(150));
    const tie = add({ goldenEggs: 40, bossKills: 30 }, details(150));
    expect(detectAchievements(tie.id)).toEqual([]);
  });

  it('compares with manual jobs and only with the jobs before it in the same session', () => {
    add({ goldenEggs: 50, bossKills: 10 }, null);
    expect(detectAchievements(add({ goldenEggs: 45 }).id)).toEqual([]);

    startSession();
    add({ goldenEggs: 10 });
    const record = add({ goldenEggs: 45 });
    add({ goldenEggs: 60 });
    expect(detectAchievements(record.id)).toEqual([{ kind: 'selfGoldenEggs', value: 45 }]);
  });

  it('skips the team record when no earlier job has the team golden eggs', () => {
    add({}, null);
    expect(detectAchievements(add({}, details(200)).id)).toEqual([]);
  });

  it('celebrates defeating every boss that appeared, even on the first job', () => {
    const allBosses = [{ boss: 'tower', appearances: 3, teamKills: 3, selfKills: 1 }, { boss: 'hebi', appearances: 0, teamKills: 0, selfKills: 0 }];
    expect(detectAchievements(add({}, details(100, allBosses)).id)).toEqual([{ kind: 'allBosses', value: null }]);
  });

  it('does not count jobs without bosses as defeating every boss', () => {
    expect(detectAchievements(add({}, details(100, [])).id)).toEqual([]);
    expect(detectAchievements(add({}, details(100, [{ boss: 'tower', appearances: 0, teamKills: 0, selfKills: 0 }])).id)).toEqual([]);
    expect(detectAchievements(add({}, null).id)).toEqual([]);
  });

  it('returns nothing for an unknown job', () => {
    expect(detectAchievements(999)).toEqual([]);
  });
});

describe('formatCelebration', () => {
  it.each([
    [{ kind: 'selfGoldenEggs' as const, value: 38 }, '本日の最高納品数を更新しました！38個', '金イクラ 38個'],
    [{ kind: 'selfBossKills' as const, value: 27 }, '本日の最高討伐数を更新しました！27体', 'オオモノ 27体'],
    [{ kind: 'teamGoldenEggs' as const, value: 152 }, '本日のハイスコアを更新しました！152個', 'ハイスコア 152個'],
  ])('uses the sentence for a single record %j', (achievement, message, detail) => {
    expect(formatCelebration([achievement])).toEqual({ telop: `🎉 本日の最高記録を更新！\n${detail}`, message });
  });

  it('uses the sentence for defeating every boss alone', () => {
    expect(formatCelebration([{ kind: 'allBosses', value: null }])).toEqual({ telop: '🎉 オオモノ全処理！', message: '先程のバイトは全てのオオモノを処理しました！' });
  });

  it('merges several achievements into one message', () => {
    expect(formatCelebration([
      { kind: 'selfGoldenEggs', value: 38 },
      { kind: 'selfBossKills', value: 27 },
      { kind: 'teamGoldenEggs', value: 152 },
      { kind: 'allBosses', value: null },
    ])).toEqual({
      telop: '🎉 本日の最高記録を更新！\n金イクラ 38個 / オオモノ 27体 / ハイスコア 152個 / 全処理',
      message: '本日の最高納品数38個、最高討伐数27体、ハイスコア152個を更新しました！さらに全てのオオモノを処理しました！',
    });
    expect(formatCelebration([{ kind: 'selfBossKills', value: 27 }, { kind: 'allBosses', value: null }])?.message)
      .toBe('本日の最高討伐数27体を更新しました！さらに全てのオオモノを処理しました！');
  });

  it('returns null when there is nothing to celebrate', () => {
    expect(formatCelebration([])).toBeNull();
  });
});
