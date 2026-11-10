import { describe, expect, it } from 'vitest';

import { SALMON_BOSSES, bossImageUrl, findSalmonBoss, isSalmonBossKey, isWaterLevel, salmonBossOrder } from './salmonBosses';

describe('SALMON_BOSSES', () => {
  it('has unique keys, names and images', () => {
    for (const field of ['key', 'name', 'image'] as const) {
      expect(new Set(SALMON_BOSSES.map((b) => b[field])).size).toBe(SALMON_BOSSES.length);
    }
  });

  it('finds a boss, its order and image URL', () => {
    expect(findSalmonBoss('tower')?.name).toBe('タワー');
    expect(salmonBossOrder('bakudan')).toBeLessThan(salmonBossOrder('hebi'));
    expect(bossImageUrl(findSalmonBoss('tower')!)).toBe('https://raw.githubusercontent.com/Leanny/splat3/main/images/coopEnemy/SakelienTower.png');
  });

  it.each([1, null, '', 'yokozuna'])('rejects %s as a boss key', (value) => {
    expect(isSalmonBossKey(value)).toBe(false);
  });

  it('knows the water levels', () => {
    expect(isWaterLevel('満潮')).toBe(true);
    expect(isWaterLevel('大潮')).toBe(false);
  });
});
