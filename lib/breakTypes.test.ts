import { describe, expect, it } from 'vitest';

import { formatBreakElapsed, isBreakAction, localBreakStart } from './breakTypes';

describe('formatBreakElapsed', () => {
  it.each([
    [0, '0:00'],
    [-5000, '0:00'],
    [59_999, '0:59'],
    [61_000, '1:01'],
    [10 * 60_000, '10:00'],
    [3_600_000 + 5 * 60_000 + 7000, '1:05:07'],
  ])('formats %d ms as %s', (ms, expected) => {
    expect(formatBreakElapsed(ms)).toBe(expected);
  });
});

describe('localBreakStart', () => {
  it('converts the start time to the browser clock', () => {
    expect(localBreakStart({ active: true, startedAt: 1000, voiceHeardAt: null, serverTime: 5000 }, 100_000)).toBe(96_000);
  });

  it('returns null when not on a break or the response is malformed', () => {
    expect(localBreakStart({ active: false, startedAt: null, voiceHeardAt: null, serverTime: 5000 })).toBeNull();
    expect(localBreakStart(null)).toBeNull();
    expect(localBreakStart({ presets: [] } as never)).toBeNull();
  });
});

describe('isBreakAction', () => {
  it('accepts only known actions', () => {
    expect(isBreakAction('start')).toBe(true);
    expect(isBreakAction('heard')).toBe(true);
    expect(isBreakAction('pause')).toBe(false);
  });
});
