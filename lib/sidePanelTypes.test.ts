import { describe, expect, it } from 'vitest';

import {
  MAX_CHALLENGES,
  MAX_CHALLENGE_LENGTH,
  MAX_FOLLOWER_GOAL,
  MAX_ROTATE_SECONDS,
  MIN_ROTATE_SECONDS,
  getDefaultSidePanelSettings,
  getFollowerProgress,
  parseSidePanelSettings,
  pickSlot,
} from './sidePanelTypes';

const challenges = [{ id: 1, text: 'キケン度MAXでクリア', done: false }, { id: 2, text: '新ブキで3クリア', done: true }];
const valid = { activeSlot: 'burndown', autoRotate: true, rotateSeconds: 30, enabledSlots: ['salmon', 'burndown'], followerGoal: 20, challenges };

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

  it('trims challenge text', () => {
    expect(parseSidePanelSettings({ ...valid, challenges: [{ id: 1, text: '  お題  ', done: false }] })).toMatchObject({
      challenges: [{ id: 1, text: 'お題', done: false }],
    });
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
    ['an unknown active slot', { ...valid, activeSlot: 'schedule' }],
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
    ['non-array challenges', { ...valid, challenges: 'お題' }],
    ['too many challenges', { ...valid, challenges: Array.from({ length: MAX_CHALLENGES + 1 }, (_, i) => ({ id: i + 1, text: 'お題', done: false })) }],
    ['an empty challenge', { ...valid, challenges: [{ id: 1, text: '   ', done: false }] }],
    ['too long a challenge', { ...valid, challenges: [{ id: 1, text: 'あ'.repeat(MAX_CHALLENGE_LENGTH + 1), done: false }] }],
    ['a challenge without done', { ...valid, challenges: [{ id: 1, text: 'お題' }] }],
    ['a challenge with an invalid id', { ...valid, challenges: [{ id: 0, text: 'お題', done: false }] }],
    ['duplicate challenge ids', { ...valid, challenges: [{ id: 1, text: 'a', done: false }, { id: 1, text: 'b', done: false }] }],
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
    expect([0, 1, 2, 3].map((i) => pickSlot({ ...settings, enabledSlots: ['salmon', 'challenges', 'burndown'] }, i))).toEqual(['salmon', 'challenges', 'burndown', 'salmon']);
  });

  it('does not rotate through the challenges by default', () => {
    expect(getDefaultSidePanelSettings().enabledSlots).not.toContain('challenges');
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
