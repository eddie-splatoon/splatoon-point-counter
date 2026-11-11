import { describe, expect, it } from 'vitest';

import { DEFAULT_SCORE_DISPLAY, MAX_SCORE_VALUE_LENGTH, formatGrade, parseScoreDisplayUpdate, parseStoredScoreDisplay } from './scoreDisplayTypes';

describe('formatGrade', () => {
  it('shows only the points for the top grade', () => {
    expect(formatGrade('でんせつ', 720)).toBe('720');
  });

  it('keeps the grade name below the top grade', () => {
    expect(formatGrade('たつじん+3', 450)).toBe('たつじん+3 450');
  });

  it('returns null when the grade was not read', () => {
    expect(formatGrade(null, 720)).toBeNull();
    expect(formatGrade('でんせつ', null)).toBeNull();
  });
});

describe('parseScoreDisplayUpdate', () => {
  it('returns only the sent items', () => {
    expect(parseScoreDisplayUpdate({ autoUpdate: false })).toEqual({ autoUpdate: false });
    expect(parseScoreDisplayUpdate({ scoreLabel: 'ハイスコア', scoreValue: '264' })).toEqual({ scoreLabel: 'ハイスコア', scoreValue: '264' });
  });

  it.each([
    ['null', null],
    ['an array', []],
    ['an empty object', {}],
    ['a numeric value', { scoreValue: 264 }],
    ['a too long value', { scoreValue: 'x'.repeat(MAX_SCORE_VALUE_LENGTH + 1) }],
    ['a string autoUpdate', { autoUpdate: 'false' }],
  ])('rejects %s', (_, body) => {
    expect(typeof parseScoreDisplayUpdate(body)).toBe('string');
  });
});

describe('parseStoredScoreDisplay', () => {
  it('fills missing or broken items with the defaults', () => {
    expect(parseStoredScoreDisplay(null)).toEqual(DEFAULT_SCORE_DISPLAY);
    expect(parseStoredScoreDisplay({ scoreValue: '999', autoUpdate: 'yes' })).toEqual({ ...DEFAULT_SCORE_DISPLAY, scoreValue: '999' });
  });
});
