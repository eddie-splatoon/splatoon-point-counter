import { describe, expect, it } from 'vitest';

import { MAX_TELOP_LENGTH, MAX_TELOP_PRESETS, getDefaultTelopSettings, normalizeTelopText, parseTelopSettings } from './telopTypes';

describe('normalizeTelopText', () => {
  it('joins lines and collapses spaces into one line', () => {
    expect(normalizeTelopText('  満潮\n きた  ')).toBe('満潮 きた');
  });

  it.each([[''], ['   '], ['あ'.repeat(MAX_TELOP_LENGTH + 1)]])('rejects %j', (text) => {
    expect(normalizeTelopText(text)).toBeNull();
  });

  it('accepts text of the maximum length', () => {
    expect(normalizeTelopText('あ'.repeat(MAX_TELOP_LENGTH))).toBe('あ'.repeat(MAX_TELOP_LENGTH));
  });
});

describe('parseTelopSettings', () => {
  it('accepts the default settings', () => {
    expect(parseTelopSettings(getDefaultTelopSettings())).toEqual(getDefaultTelopSettings());
  });

  it('normalizes preset text', () => {
    expect(parseTelopSettings({ presets: [{ id: 1, text: ' ナイス! ', speak: true, followFont: false }] })).toEqual({ presets: [{ id: 1, text: 'ナイス!', speak: true, followFont: false }] });
  });

  it('follows the common font for presets saved before followFont existed', () => {
    expect(parseTelopSettings({ presets: [{ id: 1, text: 'ナイス!', speak: true }] })).toEqual({ presets: [{ id: 1, text: 'ナイス!', speak: true, followFont: true }] });
  });

  it('accepts no presets', () => {
    expect(parseTelopSettings({ presets: [] })).toEqual({ presets: [] });
  });

  it.each([
    ['nothing', null],
    ['presets that are not an array', { presets: 'ナイス' }],
    ['too many presets', { presets: Array.from({ length: MAX_TELOP_PRESETS + 1 }, (_, i) => ({ id: i + 1, text: `${i}`, speak: false })) }],
    ['duplicate ids', { presets: [{ id: 1, text: 'a', speak: false }, { id: 1, text: 'b', speak: false }] }],
    ['a non-integer id', { presets: [{ id: 1.5, text: 'a', speak: false }] }],
    ['empty text', { presets: [{ id: 1, text: ' ', speak: false }] }],
    ['a missing speak', { presets: [{ id: 1, text: 'a' }] }],
    ['a non-boolean followFont', { presets: [{ id: 1, text: 'a', speak: false, followFont: 'yes' }] }],
  ])('rejects %s', (_, body) => {
    expect(typeof parseTelopSettings(body)).toBe('string');
  });
});
