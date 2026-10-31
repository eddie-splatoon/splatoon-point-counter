import { describe, expect, it } from 'vitest';

import { SALMON_WEAPONS, SALMON_WEAPON_CATEGORIES, SALMON_WEAPON_COUNT, findSalmonWeapon, isSalmonWeaponKey, weaponImageUrl } from './salmonWeapons';

describe('SALMON_WEAPONS', () => {
  it('has 71 weapons: 63 regular and 8 Grizzco weapons', () => {
    expect(SALMON_WEAPON_COUNT).toBe(71);
    expect(SALMON_WEAPONS.filter((w) => w.category === 'クマサン印')).toHaveLength(8);
  });

  it('has unique keys, names and images', () => {
    for (const field of ['key', 'name', 'image'] as const) {
      expect(new Set(SALMON_WEAPONS.map((w) => w[field])).size).toBe(SALMON_WEAPON_COUNT);
    }
  });

  it('is grouped in the order of the categories', () => {
    const order = SALMON_WEAPONS.map((w) => SALMON_WEAPON_CATEGORIES.indexOf(w.category));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('does not include the scopes, which are never supplied in Salmon Run', () => {
    expect(isSalmonWeaponKey('splatscope')).toBe(false);
    expect(isSalmonWeaponKey('liter4k_scope')).toBe(false);
  });

  it('finds a weapon and builds its image URL', () => {
    const weapon = findSalmonWeapon('sshooter');
    expect(weapon?.name).toBe('スプラシューター');
    expect(weaponImageUrl(weapon!)).toBe('https://raw.githubusercontent.com/Leanny/splat3/main/images/weapon_flat/Path_Wst_Shooter_Normal_00.png');
  });

  it.each([1, null, undefined, '', 'unknown'])('rejects %s as a weapon key', (value) => {
    expect(isSalmonWeaponKey(value)).toBe(false);
  });
});
