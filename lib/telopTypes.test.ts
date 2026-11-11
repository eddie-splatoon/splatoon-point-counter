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
    expect(parseTelopSettings({ presets: [{ id: 1, text: ' ナイス! ', speak: true, followFont: false, chat: true }] })).toEqual({ presets: [{ id: 1, text: 'ナイス!', speak: true, followFont: false, chat: true }] });
  });

  it('follows the common font and does not post to chat for presets saved before followFont and chat existed', () => {
    expect(parseTelopSettings({ presets: [{ id: 1, text: 'ナイス!', speak: true }] })).toEqual({ presets: [{ id: 1, text: 'ナイス!', speak: true, followFont: true, chat: false }] });
  });

  it('accepts up to 30 presets', () => {
    expect(MAX_TELOP_PRESETS).toBe(30);
    const presets = Array.from({ length: MAX_TELOP_PRESETS }, (_, i) => ({ id: i + 1, text: `${i}`, speak: false, followFont: true, chat: false }));
    expect(parseTelopSettings({ presets })).toEqual({ presets });
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
    ['a non-boolean chat', { presets: [{ id: 1, text: 'a', speak: false, chat: 'yes' }] }],
  ])('rejects %s', (_, body) => {
    expect(typeof parseTelopSettings(body)).toBe('string');
  });
});
