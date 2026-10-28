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
  pickRotationSlot,
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

  it('returns null without rotation slots', () => {
    expect(pickRotationSlot({ ...getDefaultSidePanelSettings(), rotationSlots: [] }, 3)).toBeNull();
  });

  it('shows the stats fixed and rotates nothing by default', () => {
    expect(getDefaultSidePanelSettings()).toMatchObject({ fixedSlots: ['salmon'], rotationSlots: [] });
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
