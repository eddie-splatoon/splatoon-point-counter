import { describe, expect, it } from 'vitest';

import {
  MAX_CHALLENGES,
  MAX_CHALLENGE_LENGTH,
  MAX_CHALLENGE_LINES,
  MAX_FOLLOWER_GOAL,
  MAX_ROTATE_SECONDS,
  MIN_ROTATE_SECONDS,
  getDefaultSidePanelSettings,
  getFollowerProgress,
  parseSidePanelSettings,
  exceedsSlotArea,
  pickRotationSlot,
  verticalSlotArea,
  verticalSlotScale,
  type SidePanelSettings,
} from './sidePanelTypes';

const challenges = [{ id: 1, text: 'キケン度MAXでクリア', done: false }, { id: 2, text: '新ブキで3クリア', done: true }];
const valid = { fixedSlots: ['schedule'], rotationSlots: ['salmon', 'burndown'], rotateSeconds: 30, followerGoal: 20, challenges };

describe('parseSidePanelSettings', () => {
  it('accepts valid settings', () => {
    expect(parseSidePanelSettings(valid)).toEqual(valid);
  });

  it('accepts the default settings', () => {
    expect(parseSidePanelSettings(getDefaultSidePanelSettings())).toEqual(getDefaultSidePanelSettings());
  });

  it('treats settings saved before followerGoal and challenges existed as having neither', () => {
    const saved: Record<string, unknown> = { ...valid };
    delete saved.followerGoal;
    delete saved.challenges;
    expect(parseSidePanelSettings(saved)).toEqual({ ...valid, followerGoal: null, challenges: [] });
  });

  describe('settings saved in an older format', () => {
    const legacy = { rotateSeconds: 30, followerGoal: 20, challenges };

    it('reads auto rotation as rotation slots only', () => {
      expect(parseSidePanelSettings({ ...legacy, visibleSlots: ['schedule'], autoRotate: true, enabledSlots: ['salmon', 'burndown'] })).toMatchObject({
        fixedSlots: [], rotationSlots: ['salmon', 'burndown'],
      });
    });

    it('reads no rotation as fixed slots only', () => {
      expect(parseSidePanelSettings({ ...legacy, visibleSlots: ['schedule', 'salmon'], autoRotate: false, enabledSlots: ['salmon', 'burndown'] })).toMatchObject({
        fixedSlots: ['schedule', 'salmon'], rotationSlots: [],
      });
    });

    it.each([
      ['auto rotation without enabledSlots', { visibleSlots: ['salmon'], autoRotate: true }],
      ['auto rotation with no enabledSlots', { visibleSlots: ['salmon'], autoRotate: true, enabledSlots: [] }],
      ['no rotation without visibleSlots or activeSlot', { autoRotate: false, enabledSlots: ['salmon'] }],
    ])('rejects %s, so the defaults are used instead', (_, slots) => {
      expect(parseSidePanelSettings({ ...legacy, ...slots })).toBeTypeOf('string');
    });

    it('treats a null area in the new format as empty', () => {
      expect(parseSidePanelSettings({ ...legacy, fixedSlots: null, rotationSlots: ['salmon'] })).toMatchObject({ fixedSlots: [], rotationSlots: ['salmon'] });
    });

    it('reads a single activeSlot as a fixed slot', () => {
      const parsed = parseSidePanelSettings({ ...legacy, activeSlot: 'challenges', autoRotate: false, enabledSlots: ['salmon'] });
      expect(parsed).toMatchObject({ fixedSlots: ['challenges'], rotationSlots: [] });
      expect(parsed).not.toHaveProperty('activeSlot');
      expect(parsed).not.toHaveProperty('autoRotate');
      expect(parsed).not.toHaveProperty('enabledSlots');
    });
  });

  it('orders the slots and drops duplicates', () => {
    expect(parseSidePanelSettings({ ...valid, fixedSlots: ['challenges', 'schedule', 'challenges'], rotationSlots: ['burndown', 'salmon'] })).toMatchObject({
      fixedSlots: ['schedule', 'challenges'], rotationSlots: ['salmon', 'burndown'],
    });
  });

  it('allows either area to be empty', () => {
    expect(parseSidePanelSettings({ ...valid, fixedSlots: [] })).toMatchObject({ fixedSlots: [] });
    expect(parseSidePanelSettings({ ...valid, rotationSlots: [] })).toMatchObject({ rotationSlots: [] });
  });

  it('treats a missing area as empty when the other is given', () => {
    const saved: Record<string, unknown> = { ...valid };
    delete saved.rotationSlots;
    expect(parseSidePanelSettings(saved)).toMatchObject({ fixedSlots: ['schedule'], rotationSlots: [] });
  });

  it('rotates the burndown below other fixed slots', () => {
    expect(parseSidePanelSettings({ ...valid, fixedSlots: ['schedule', 'salmon'], rotationSlots: ['burndown'] })).not.toBeTypeOf('string');
  });

  it('fixes the burndown alone', () => {
    expect(parseSidePanelSettings({ ...valid, fixedSlots: ['burndown'], rotationSlots: [] })).toMatchObject({ fixedSlots: ['burndown'] });
  });

  it('trims challenge text', () => {
    expect(parseSidePanelSettings({ ...valid, challenges: [{ id: 1, text: '  お題  ', done: false }] })).toMatchObject({
      challenges: [{ id: 1, text: 'お題', done: false }],
    });
  });

  it('keeps line breaks in challenge text, trimming each line and dropping empty lines', () => {
    expect(parseSidePanelSettings({ ...valid, challenges: [{ id: 1, text: ' キケン度MAXで \r\n\n 3連続クリア ', done: false }] })).toMatchObject({
      challenges: [{ id: 1, text: 'キケン度MAXで\n3連続クリア', done: false }],
    });
  });

  it('does not count line breaks toward the challenge length', () => {
    const text = ['あ'.repeat(MAX_CHALLENGE_LENGTH - 1), 'い'].join('\n');
    expect(parseSidePanelSettings({ ...valid, challenges: [{ id: 1, text, done: false }] })).not.toBeTypeOf('string');
  });

  it('accepts the maximum number and length of challenges', () => {
    const many = Array.from({ length: MAX_CHALLENGES }, (_, i) => ({ id: i + 1, text: 'あ'.repeat(MAX_CHALLENGE_LENGTH), done: false }));
    expect(parseSidePanelSettings({ ...valid, challenges: many })).not.toBeTypeOf('string');
  });

  it('accepts the follower goal bounds and null', () => {
    expect(parseSidePanelSettings({ ...valid, followerGoal: 1 })).not.toBeTypeOf('string');
    expect(parseSidePanelSettings({ ...valid, followerGoal: MAX_FOLLOWER_GOAL })).not.toBeTypeOf('string');
    expect(parseSidePanelSettings({ ...valid, followerGoal: null })).toMatchObject({ followerGoal: null });
  });

  it('accepts the rotation bounds', () => {
    expect(parseSidePanelSettings({ ...valid, rotateSeconds: MIN_ROTATE_SECONDS })).not.toBeTypeOf('string');
    expect(parseSidePanelSettings({ ...valid, rotateSeconds: MAX_ROTATE_SECONDS })).not.toBeTypeOf('string');
  });

  it.each([
    ['null', null],
    ['an unknown fixed slot', { ...valid, fixedSlots: ['unknown-slot'] }],
    ['an unknown rotation slot', { ...valid, rotationSlots: ['salmon', 'unknown-slot'] }],
    ['non-array fixed slots', { ...valid, fixedSlots: 'salmon' }],
    ['no slots at all', { ...valid, fixedSlots: [], rotationSlots: [] }],
    ['a slot both fixed and rotated', { ...valid, fixedSlots: ['salmon'], rotationSlots: ['salmon', 'challenges'] }],
    ['a fixed burndown with another fixed slot', { ...valid, fixedSlots: ['salmon', 'burndown'], rotationSlots: [] }],
    ['a fixed burndown with rotation slots', { ...valid, fixedSlots: ['burndown'], rotationSlots: ['salmon'] }],
    ['an old format without valid slots', { rotateSeconds: 30, activeSlot: 'unknown-slot', autoRotate: false }],
    ['too short a rotation', { ...valid, rotateSeconds: MIN_ROTATE_SECONDS - 1 }],
    ['too long a rotation', { ...valid, rotateSeconds: MAX_ROTATE_SECONDS + 1 }],
    ['a fractional rotation', { ...valid, rotateSeconds: 10.5 }],
    ['a zero follower goal', { ...valid, followerGoal: 0 }],
    ['too large a follower goal', { ...valid, followerGoal: MAX_FOLLOWER_GOAL + 1 }],
    ['a fractional follower goal', { ...valid, followerGoal: 1.5 }],
    ['a string follower goal', { ...valid, followerGoal: '20' }],
    ['non-array challenges', { ...valid, challenges: 'お題' }],
    ['too many challenges', { ...valid, challenges: Array.from({ length: MAX_CHALLENGES + 1 }, (_, i) => ({ id: i + 1, text: 'お題', done: false })) }],
    ['an empty challenge', { ...valid, challenges: [{ id: 1, text: '   ', done: false }] }],
    ['too long a challenge', { ...valid, challenges: [{ id: 1, text: 'あ'.repeat(MAX_CHALLENGE_LENGTH + 1), done: false }] }],
    ['too many lines in a challenge', { ...valid, challenges: [{ id: 1, text: Array.from({ length: MAX_CHALLENGE_LINES + 1 }, () => 'a').join('\n'), done: false }] }],
    ['a challenge of only line breaks', { ...valid, challenges: [{ id: 1, text: '\n \n', done: false }] }],
    ['a challenge without done', { ...valid, challenges: [{ id: 1, text: 'お題' }] }],
    ['a challenge with an invalid id', { ...valid, challenges: [{ id: 0, text: 'お題', done: false }] }],
    ['duplicate challenge ids', { ...valid, challenges: [{ id: 1, text: 'a', done: false }, { id: 1, text: 'b', done: false }] }],
  ])('rejects %s', (_, input) => {
    expect(parseSidePanelSettings(input)).toBeTypeOf('string');
  });
});

describe('pickRotationSlot', () => {
  it('cycles through the rotation slots', () => {
    const settings: SidePanelSettings = { ...getDefaultSidePanelSettings(), rotationSlots: ['salmon', 'challenges', 'burndown'] };
    expect([0, 1, 2, 3].map((i) => pickRotationSlot(settings, i))).toEqual(['salmon', 'challenges', 'burndown', 'salmon']);
  });

  it('skips the slots with nothing to show', () => {
    const settings: SidePanelSettings = { ...getDefaultSidePanelSettings(), rotationSlots: ['salmon', 'weaponCard', 'challenges'] };
    const canShow = (slot: string) => slot !== 'challenges';
    expect([0, 1, 2, 3].map((i) => pickRotationSlot(settings, i, canShow))).toEqual(['salmon', 'weaponCard', 'salmon', 'weaponCard']);
    expect(pickRotationSlot(settings, 0, () => false)).toBeNull();
  });

  it('returns null without rotation slots', () => {
    expect(pickRotationSlot({ ...getDefaultSidePanelSettings(), rotationSlots: [] }, 3)).toBeNull();
  });

  it('shows the stats fixed and rotates nothing by default', () => {
    expect(getDefaultSidePanelSettings()).toMatchObject({ fixedSlots: ['salmon'], rotationSlots: [] });
  });
});

describe('exceedsSlotArea', () => {
  const settings = (fixedSlots: SidePanelSettings['fixedSlots'], rotationSlots: SidePanelSettings['rotationSlots'], challengeCount = 0) => ({
    fixedSlots,
    rotationSlots,
    challenges: Array.from({ length: challengeCount }, (_, i) => ({ id: i + 1, text: 'お題', done: false })),
  });

  it.each([
    ['the stats alone', settings(['salmon'], [])],
    ['the schedule with the stats rotating below', settings(['schedule'], ['salmon', 'challenges'], 3)],
    ['the burndown rotating alone', settings([], ['burndown'])],
    ['the schedule with the stats and the weapon card rotating below', settings(['schedule'], ['salmon', 'weaponCard'])],
  ])('fits %s', (_, s) => {
    expect(exceedsSlotArea(s)).toBe(false);
  });

  it.each([
    ['three fixed slots', settings(['schedule', 'salmon', 'challenges'], [], 4)],
    ['the burndown rotating below two fixed slots', settings(['schedule', 'salmon'], ['burndown'])],
    ['many challenges rotating below the schedule', settings(['schedule'], ['challenges'], 8)],
    ['the weapon card below the schedule and the stats', settings(['schedule', 'salmon', 'weaponCard'], [])],
  ])('does not fit %s', (_, s) => {
    expect(exceedsSlotArea(s)).toBe(true);
  });

  it('ignores challenges with nothing to show', () => {
    expect(exceedsSlotArea(settings(['schedule', 'salmon', 'challenges'], [], 0))).toBe(false);
  });
});

describe('verticalSlotScale', () => {
  const settings = (fixedSlots: SidePanelSettings['fixedSlots'], rotationSlots: SidePanelSettings['rotationSlots'], challengeCount = 0) => ({
    fixedSlots,
    rotationSlots,
    challenges: Array.from({ length: challengeCount }, (_, i) => ({ id: i + 1, text: 'お題', done: false })),
  });
  // 拡大後のスロットが領域に収まるか（幅は 250px のカードと 12px の間隔、高さは目安の最大）
  const fits = (scale: number, columns: number, height: number, gaugeShown: boolean) => {
    const area = verticalSlotArea(gaugeShown);
    return (250 * columns + 12 * (columns - 1)) * scale <= area.width && height * scale <= area.height;
  };

  it('enlarges a few slots up to the limit', () => {
    expect(verticalSlotScale(settings(['salmon'], []), true)).toBe(1.5);
  });

  it('shrinks to fit many slots side by side', () => {
    const scale = verticalSlotScale(settings(['schedule', 'salmon'], ['weaponCard']), true);
    expect(scale).toBeLessThan(1);
    expect(fits(scale, 3, 200, true)).toBe(true);
  });

  it('uses the width of the gauge for the slots when the gauge is hidden', () => {
    const slots = settings(['schedule', 'salmon'], ['weaponCard']);
    expect(verticalSlotScale(slots, false)).toBeGreaterThan(verticalSlotScale(slots, true));
    expect(fits(verticalSlotScale(slots, false), 3, 200, false)).toBe(true);
  });

  it('shrinks to fit the height of many challenges', () => {
    const scale = verticalSlotScale(settings([], ['salmon', 'challenges'], 8), true);
    expect(scale).toBeLessThan(1);
    expect(fits(scale, 1, 450, true)).toBe(true);
  });

  it('does not count challenges with nothing to show as a column', () => {
    expect(verticalSlotScale(settings(['schedule', 'salmon', 'challenges'], [], 0), false))
      .toBe(verticalSlotScale(settings(['schedule', 'salmon'], []), false));
  });
});

describe('getFollowerProgress', () => {
  const twitch = { followerTotal: 10, goal: null };

  it('prefers the Twitch follower goal', () => {
    expect(getFollowerProgress({ ...twitch, goal: { current: 12, target: 30 } }, 20)).toEqual({ current: 12, target: 30 });
  });

  it('falls back to the follower total and the manual goal', () => {
    expect(getFollowerProgress(twitch, 20)).toEqual({ current: 10, target: 20 });
  });

  it('returns null without any goal', () => {
    expect(getFollowerProgress(twitch, null)).toBeNull();
  });

  it('returns null before the Twitch script sends the follower total', () => {
    expect(getFollowerProgress({ followerTotal: null, goal: null }, 20)).toBeNull();
  });
});
