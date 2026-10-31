// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';

import { __TEST_ONLY_setDb, openDb, setAppState } from './db';
import { addJob, deleteJob } from './salmon';
import { getWeaponCard, parseManualWeapon, setManualWeapon, startWeaponCard } from './weaponCard';

const job = (weapons: string[]) => ({ goldenEggs: 30, bossKills: 12, deaths: 1, cleared: true, waveReached: 3, stage: '', weapons });

beforeEach(() => {
  __TEST_ONLY_setDb(openDb(':memory:'));
});

describe('weapon card', () => {
  it('is empty before anything is recorded', () => {
    expect(getWeaponCard()).toEqual({ startedAt: 0, total: 71, obtained: [] });
  });

  it('fills the weapons of recorded jobs once, in the order they were first obtained', () => {
    addJob(job(['sshooter', 'pablo']), 1000);
    addJob(job(['pablo', 'kuma_blaster', 'kuma_blaster']), 2000);

    expect(getWeaponCard().obtained).toEqual([
      { key: 'sshooter', at: 1000, source: 'job' },
      { key: 'pablo', at: 1000, source: 'job' },
      { key: 'kuma_blaster', at: 2000, source: 'job' },
    ]);
  });

  it('unfills a weapon when its job is deleted', () => {
    const recorded = addJob(job(['sshooter']), 1000);
    deleteJob(recorded.id);
    expect(getWeaponCard().obtained).toEqual([]);
  });

  it('fills and unfills weapons manually', () => {
    setManualWeapon('hokusai', true, 500);
    setManualWeapon('hokusai', true, 900); // 埋め直しても最初の時刻のまま
    expect(getWeaponCard().obtained).toEqual([{ key: 'hokusai', at: 500, source: 'manual' }]);

    setManualWeapon('hokusai', false);
    expect(getWeaponCard().obtained).toEqual([]);
  });

  it('treats a weapon filled both ways as from a job, keeping the earliest time', () => {
    setManualWeapon('sshooter', true, 500);
    addJob(job(['sshooter']), 1000);
    expect(getWeaponCard().obtained).toEqual([{ key: 'sshooter', at: 500, source: 'job' }]);

    // 手動分を外しても記録から埋まったまま
    setManualWeapon('sshooter', false);
    expect(getWeaponCard().obtained).toEqual([{ key: 'sshooter', at: 1000, source: 'job' }]);
  });

  it('starts a new card that ignores earlier jobs and manual fills', () => {
    addJob(job(['sshooter']), 1000);
    setManualWeapon('pablo', true, 1500);

    expect(startWeaponCard(2000)).toEqual({ startedAt: 2000, total: 71, obtained: [] });
    addJob(job(['nova']), 3000);
    expect(getWeaponCard().obtained.map((w) => w.key)).toEqual(['nova']);
  });

  it('ignores a broken saved state', () => {
    setAppState('weaponCard', { startedAt: 'x', manual: [{ key: 'unknown', at: 1 }, { key: 'pablo', at: -1 }, null] });
    expect(getWeaponCard()).toEqual({ startedAt: 0, total: 71, obtained: [] });
  });
});

describe('parseManualWeapon', () => {
  it('accepts a known weapon', () => {
    expect(parseManualWeapon({ weapon: 'pablo', obtained: false })).toEqual({ weapon: 'pablo', obtained: false });
  });

  it.each([
    ['null body', null],
    ['an unknown weapon', { weapon: 'splatscope', obtained: true }],
    ['a missing obtained', { weapon: 'pablo' }],
    ['a non-boolean obtained', { weapon: 'pablo', obtained: 'true' }],
  ])('rejects %s', (_, body) => {
    expect(typeof parseManualWeapon(body)).toBe('string');
  });
});
