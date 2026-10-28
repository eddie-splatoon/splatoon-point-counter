import { describe, expect, it } from 'vitest';

import {
  MAX_FOLLOWER_GOAL,
  MAX_ROTATE_SECONDS,
  MIN_ROTATE_SECONDS,
  getDefaultSidePanelSettings,
  getFollowerProgress,
  parseSidePanelSettings,
  pickSlot,
} from './sidePanelTypes';

const valid = { activeSlot: 'burndown', autoRotate: true, rotateSeconds: 30, enabledSlots: ['salmon', 'burndown'], followerGoal: 20 };

describe('parseSidePanelSettings', () => {
  it('accepts valid settings', () => {
    expect(parseSidePanelSettings(valid)).toEqual(valid);
  });

  it('accepts the default settings', () => {
    expect(parseSidePanelSettings(getDefaultSidePanelSettings())).toEqual(getDefaultSidePanelSettings());
  });

  it('treats settings saved before followerGoal existed as having no follower goal', () => {
    const saved: Record<string, unknown> = { ...valid };
    delete saved.followerGoal;
    expect(parseSidePanelSettings(saved)).toEqual({ ...valid, followerGoal: null });
  });

  it('accepts the follower goal bounds and null', () => {
    expect(parseSidePanelSettings({ ...valid, followerGoal: 1 })).not.toBeTypeOf('string');
    expect(parseSidePanelSettings({ ...valid, followerGoal: MAX_FOLLOWER_GOAL })).not.toBeTypeOf('string');
    expect(parseSidePanelSettings({ ...valid, followerGoal: null })).toMatchObject({ followerGoal: null });
  });

  it('orders enabled slots and drops duplicates', () => {
    expect(parseSidePanelSettings({ ...valid, enabledSlots: ['burndown', 'salmon', 'burndown'] })).toMatchObject({
      enabledSlots: ['salmon', 'burndown'],
    });
  });

  it('accepts the rotation bounds', () => {
    expect(parseSidePanelSettings({ ...valid, rotateSeconds: MIN_ROTATE_SECONDS })).not.toBeTypeOf('string');
    expect(parseSidePanelSettings({ ...valid, rotateSeconds: MAX_ROTATE_SECONDS })).not.toBeTypeOf('string');
  });

  it.each([
    ['null', null],
    ['an unknown active slot', { ...valid, activeSlot: 'challenges' }],
    ['a non-boolean autoRotate', { ...valid, autoRotate: 'yes' }],
    ['too short a rotation', { ...valid, rotateSeconds: MIN_ROTATE_SECONDS - 1 }],
    ['too long a rotation', { ...valid, rotateSeconds: MAX_ROTATE_SECONDS + 1 }],
    ['a fractional rotation', { ...valid, rotateSeconds: 10.5 }],
    ['no enabled slots', { ...valid, enabledSlots: [] }],
    ['an unknown enabled slot', { ...valid, enabledSlots: ['salmon', 'schedule'] }],
    ['non-array enabled slots', { ...valid, enabledSlots: 'salmon' }],
    ['a zero follower goal', { ...valid, followerGoal: 0 }],
    ['too large a follower goal', { ...valid, followerGoal: MAX_FOLLOWER_GOAL + 1 }],
    ['a fractional follower goal', { ...valid, followerGoal: 1.5 }],
    ['a string follower goal', { ...valid, followerGoal: '20' }],
  ])('rejects %s', (_, input) => {
    expect(parseSidePanelSettings(input)).toBeTypeOf('string');
  });
});

describe('pickSlot', () => {
  it('shows the active slot when not rotating', () => {
    expect(pickSlot({ ...getDefaultSidePanelSettings(), activeSlot: 'burndown', autoRotate: false }, 5)).toBe('burndown');
  });

  it('cycles through the enabled slots when rotating', () => {
    const settings = { ...getDefaultSidePanelSettings(), autoRotate: true };
    expect([0, 1, 2, 3].map((i) => pickSlot(settings, i))).toEqual(['salmon', 'burndown', 'salmon', 'burndown']);
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
