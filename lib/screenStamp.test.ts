// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';

import { __TEST_ONLY_setDb, getAppState, openDb, setAppState } from './db';
import {
  __TEST_ONLY_resetScreenStamp,
  endScreenStampWindow,
  getScreenStampData,
  getScreenStampStats,
  receiveChat,
  saveScreenStampSettings,
  SCREEN_STAMP_STATS_STATE_KEY,
} from './screenStamp';
import { DEFAULT_SCREEN_STAMP_SETTINGS } from './screenStampTypes';

const T = 1_700_000_000_000;
const DAY = 24 * 60 * 60_000;

beforeEach(() => {
  __TEST_ONLY_setDb(openDb(':memory:'));
  __TEST_ONLY_resetScreenStamp();
});

describe('receiveChat', () => {
  it('shows a matching stamp and ignores other messages', () => {
    expect(receiveChat('1', 'ナイスじゃない', [], T)).toEqual({ result: 'none', stampId: null });
    expect(getScreenStampData(T).current).toBeNull();

    expect(receiveChat('1', 'ナイス！', [], T)).toEqual({ result: 'shown', stampId: 'nice' });
    expect(getScreenStampData(T + 1)).toEqual({
      current: { id: 1, stampId: 'nice', label: 'ナイス', imageUrl: null, timestamp: T }, serverTime: T + 1,
    });
  });

  it('limits the same stamp to once per 10 seconds and any stamp to once per 3 seconds', () => {
    expect(receiveChat('1', 'ナイス', [], T).result).toBe('shown');
    expect(receiveChat('2', 'ドンマイ', [], T + 2999).result).toBe('throttled');
    expect(receiveChat('2', 'ドンマイ', [], T + 3000).result).toBe('shown');
    expect(receiveChat('3', 'ナイス', [], T + 9999).result).toBe('throttled');
    expect(receiveChat('3', 'ナイス', [], T + 10_000).result).toBe('shown');
    expect(getScreenStampData(T + 10_000).current).toMatchObject({ id: 3, stampId: 'nice' });
  });

  it('does nothing when disabled', () => {
    saveScreenStampSettings({ ...DEFAULT_SCREEN_STAMP_SETTINGS, enabled: false });
    expect(receiveChat('1', 'ナイス', [], T).result).toBe('disabled');
  });

  it('uses the image and follower emote names in the settings', () => {
    saveScreenStampSettings({
      enabled: true,
      stamps: [{ id: 'nice', label: 'ナイス', words: [], emotes: ['eddiesp2Nice'], imageUrl: '/stamps/nice.png' }],
    });
    expect(receiveChat('1', 'すごい', ['eddiesp2Nice'], T).result).toBe('shown');
    expect(getScreenStampData(T).current?.imageUrl).toBe('/stamps/nice.png');
  });
});

describe('stats', () => {
  it('counts shown stamps and distinct users per stream without names', () => {
    receiveChat('1', 'ナイス', [], T);
    receiveChat('1', 'ナイス', [], T + 10_000);
    receiveChat('2', 'ナイス', [], T + 20_000);
    receiveChat('2', 'ドンマイ', [], T + 30_000);
    // 間隔の制限で出さなかったものは数えない
    receiveChat('3', 'ドンマイ', [], T + 31_000);

    expect(getScreenStampStats(T + 40_000)).toEqual([{
      startedAt: T,
      endedAt: null,
      stamps: [{ id: 'nice', label: 'ナイス', shown: 3, users: 2 }, { id: 'donmai', label: 'ドンマイ', shown: 1, users: 1 }],
    }]);
    expect(JSON.stringify(getAppState(SCREEN_STAMP_STATS_STATE_KEY))).not.toContain('"1"');
  });

  it('closes the stream on offline and starts a new one with the next stamp', () => {
    receiveChat('1', 'ナイス', [], T);
    endScreenStampWindow(T + 60_000);
    receiveChat('1', 'ナイス', [], T + DAY);

    expect(getScreenStampStats(T + DAY)).toEqual([
      { startedAt: T + DAY, endedAt: null, stamps: [{ id: 'nice', label: 'ナイス', shown: 1, users: 1 }] },
      { startedAt: T, endedAt: T + 60_000, stamps: [{ id: 'nice', label: 'ナイス', shown: 1, users: 1 }] },
    ]);
  });

  it('keeps counting into the open stream after a server restart', () => {
    receiveChat('1', 'ナイス', [], T);
    __TEST_ONLY_resetScreenStamp();
    receiveChat('2', 'ナイス', [], T + 20_000);

    expect(getScreenStampStats(T + 20_000)).toEqual([
      { startedAt: T, endedAt: null, stamps: [{ id: 'nice', label: 'ナイス', shown: 2, users: 1 }] },
    ]);
  });

  it('drops streams older than 28 days and broken entries', () => {
    setAppState(SCREEN_STAMP_STATS_STATE_KEY, [
      { startedAt: T - 40 * DAY, endedAt: T - 29 * DAY, stamps: [] },
      { startedAt: T - 2 * DAY, endedAt: T - DAY, stamps: [] },
      { startedAt: 'x' },
    ]);
    expect(getScreenStampStats(T)).toEqual([{ startedAt: T - 2 * DAY, endedAt: T - DAY, stamps: [] }]);
  });
});
