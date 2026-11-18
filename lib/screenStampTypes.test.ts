import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SCREEN_STAMP_SETTINGS,
  isStampImageUrl,
  matchScreenStamp,
  normalizeStampText,
  parseScreenStampSettings,
  parseStoredScreenStampSettings,
  splitStampWords,
} from './screenStampTypes';

const stamps = DEFAULT_SCREEN_STAMP_SETTINGS.stamps;
const match = (text: string, emotes: string[] = []) => matchScreenStamp(text, stamps, emotes)?.id ?? null;

describe('normalizeStampText', () => {
  it('removes a leading "!" and trailing stretches', () => {
    expect(normalizeStampText('！ナイス〜〜')).toBe('ないす');
    expect(normalizeStampText('ナイスゥ!! ')).toBe('ないす');
    expect(normalizeStampText('​ｎｉｃｅ～')).toBe('nice');
  });
});

describe('matchScreenStamp', () => {
  it.each(['ナイス', 'ないす', 'ナイス！', 'ナイス!!', 'nice', 'NICE', 'ないすぅ', 'ナイスー', '!ナイス', '！ないす', '! ナイス'])(
    'shows ナイス for %s', (text) => {
      expect(match(text)).toBe('nice');
    });

  it.each(['ナイスじゃない', '今のナイスだった？', 'ナイス？', 'ないすないす', '', '!'])('shows nothing for %s', (text) => {
    expect(match(text)).toBeNull();
  });

  it('reads the other stamps', () => {
    expect(match('ドンマイ！')).toBe('donmai');
    expect(match('donmai')).toBe('donmai');
    expect(match('カンスト')).toBe('kansuto');
  });

  it('matches follower emotes by the name in the settings, anywhere in the message', () => {
    const withEmotes = stamps.map((s) => (s.id === 'donmai' ? { ...s, emotes: ['eddiesp2Donmai'] } : s));
    expect(matchScreenStamp('今のは惜しかった', withEmotes, ['Kappa', 'eddiesp2Donmai'])?.id).toBe('donmai');
    // スタンプが設定に無ければ文字で判定する
    expect(matchScreenStamp('ナイス', withEmotes, ['eddiesp2Old'])?.id).toBe('nice');
  });
});

describe('parseScreenStampSettings', () => {
  const stamp = { id: 'nice', label: 'ナイス', words: ['ないす'], emotes: ['eddiesp2Nice'], imageUrl: '/stamps/nice.png' };

  it('accepts valid settings and trims values', () => {
    expect(parseScreenStampSettings({ enabled: false, stamps: [{ ...stamp, label: ' ナイス ', imageUrl: ' ' }] })).toEqual({
      enabled: false, stamps: [{ ...stamp, imageUrl: null }],
    });
  });

  it('treats missing emotes and imageUrl (added later) as empty', () => {
    expect(parseScreenStampSettings({ enabled: true, stamps: [{ id: 'nice', label: 'ナイス', words: [] }] })?.stamps[0])
      .toEqual({ id: 'nice', label: 'ナイス', words: [], emotes: [], imageUrl: null });
  });

  it.each([
    ['an empty label', { ...stamp, label: ' ' }],
    ['a long label', { ...stamp, label: 'あいうえおかきくけ' }],
    ['a bad id', { ...stamp, id: 'Nice!' }],
    ['a bad emote name', { ...stamp, emotes: ['eddie sp2'] }],
    ['an http image', { ...stamp, imageUrl: 'http://example.com/a.png' }],
    ['a javascript image', { ...stamp, imageUrl: 'javascript:alert(1)' }],
    ['too many words', { ...stamp, words: Array.from({ length: 11 }, (_, i) => `w${i}`) }],
  ])('rejects %s', (_, value) => {
    expect(parseScreenStampSettings({ enabled: true, stamps: [value] })).toBeNull();
  });

  it('rejects duplicated ids and emote names', () => {
    expect(parseScreenStampSettings({ enabled: true, stamps: [stamp, { ...stamp, emotes: [] }] })).toBeNull();
    expect(parseScreenStampSettings({ enabled: true, stamps: [stamp, { ...stamp, id: 'other' }] })).toBeNull();
  });

  it('falls back to the defaults for a broken stored value', () => {
    expect(parseStoredScreenStampSettings(null)).toEqual(DEFAULT_SCREEN_STAMP_SETTINGS);
    expect(parseStoredScreenStampSettings({ enabled: 'yes', stamps: [] })).toEqual(DEFAULT_SCREEN_STAMP_SETTINGS);
  });
});

describe('helpers', () => {
  it('accepts https and local image paths only', () => {
    expect(isStampImageUrl('https://example.com/nice.png')).toBe(true);
    expect(isStampImageUrl('/stamps/nice.png')).toBe(true);
    expect(isStampImageUrl('//evil.example/a.png')).toBe(false);
    expect(isStampImageUrl('data:image/png;base64,AAA')).toBe(false);
  });

  it('splits words by 、 , and newlines', () => {
    expect(splitStampWords('ないす、nice, ナイス\n\n たすかる ')).toEqual(['ないす', 'nice', 'ナイス', 'たすかる']);
  });
});
