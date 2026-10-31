import { describe, expect, it } from 'vitest';

import { SALMON_WEAPONS } from './salmonWeapons';
import { canvasFontFamily, cellPosition, IMAGE_COLUMNS, IMAGE_HEIGHT, IMAGE_WIDTH, weaponCardImageFileName } from './weaponCardImage';

describe('weaponCardImage', () => {
  it('lays out every weapon inside the image without overlapping', () => {
    const positions = SALMON_WEAPONS.map((_, i) => cellPosition(i));
    for (const { x, y } of positions) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x + 88).toBeLessThanOrEqual(IMAGE_WIDTH);
      expect(y + 88).toBeLessThan(IMAGE_HEIGHT);
    }
    expect(new Set(positions.map(({ x, y }) => `${x},${y}`)).size).toBe(SALMON_WEAPONS.length);
    // 1 行に IMAGE_COLUMNS 個並べて折り返す
    expect(cellPosition(IMAGE_COLUMNS).x).toBe(cellPosition(0).x);
    expect(cellPosition(IMAGE_COLUMNS).y).toBeGreaterThan(cellPosition(0).y);
  });

  it('is landscape so it fits SNS timelines', () => {
    expect(IMAGE_WIDTH).toBeGreaterThan(IMAGE_HEIGHT);
  });

  it('names the file with the local date and time', () => {
    expect(weaponCardImageFileName(new Date(2026, 9, 31, 9, 5))).toBe('weapon-card-20261031-0905.png');
  });

  it('quotes each font name so the canvas does not ignore it, and falls back to Japanese fonts', () => {
    expect(canvasFontFamily('FOT-Kurokane Std')).toMatch(/^"FOT-Kurokane Std", "Hiragino Sans", .*sans-serif$/);
    expect(canvasFontFamily('Splatfont 2, \'Noto Sans JP\', serif')).toMatch(/^"Splatfont 2", 'Noto Sans JP', serif, "Hiragino Sans"/);
    expect(canvasFontFamily('')).toMatch(/^"Hiragino Sans"/);
    expect(canvasFontFamily('a"b')).toMatch(/^"ab", /);
  });
});
