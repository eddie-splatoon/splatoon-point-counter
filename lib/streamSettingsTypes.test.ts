import { describe, expect, it } from 'vitest';

import {
  DEFAULT_STREAM_SETTINGS,
  isValidStreamSetting,
  parseStoredStreamSettings,
  parseStreamSettingsUpdate,
} from './streamSettingsTypes';

describe('parseStreamSettingsUpdate', () => {
  it('accepts a partial update', () => {
    expect(parseStreamSettingsUpdate({ fontSize: 60, transitionEffect: 'slide' })).toEqual({
      ok: true,
      update: { fontSize: 60, transitionEffect: 'slide' },
    });
  });

  it('keeps only the known keys of nested objects', () => {
    const result = parseStreamSettingsUpdate({
      messagePresets: [{ name: '通常', extra: 'x'.repeat(1000), messages: [{ id: 1, text: 'a', extra: 1 }] }],
      burndown: { label: 'あと', targetValue: 10, extra: true, entries: [{ score: 1, timestamp: 2, extra: [] }] },
    });
    expect(result).toEqual({
      ok: true,
      update: {
        messagePresets: [{ name: '通常', messages: [{ id: 1, text: 'a' }] }],
        burndown: { label: 'あと', targetValue: 10, entries: [{ score: 1, timestamp: 2 }] },
      },
    });
  });

  it('names the invalid and unknown fields', () => {
    expect(parseStreamSettingsUpdate({ fontSize: 0 })).toEqual({ ok: false, message: 'Invalid fields: fontSize.' });
    expect(parseStreamSettingsUpdate({ lastEvent: null })).toEqual({ ok: false, message: 'Unknown fields: lastEvent.' });
    expect(parseStreamSettingsUpdate({}).ok).toBe(false);
    expect(parseStreamSettingsUpdate(null).ok).toBe(false);
  });
});

describe('isValidStreamSetting', () => {
  it('rejects values typed halfway in the control panel', () => {
    // 数値の入力欄を空にすると Number('') = 0 になる
    expect(isValidStreamSetting('fontSize', 0)).toBe(false);
    expect(isValidStreamSetting('transitionDuration', 0)).toBe(false);
    expect(isValidStreamSetting('fontSize', Number.NaN)).toBe(false);
    expect(isValidStreamSetting('fontSize', 54)).toBe(true);
  });
});

describe('parseStoredStreamSettings', () => {
  it('returns the defaults for nothing saved', () => {
    expect(parseStoredStreamSettings(null)).toEqual(DEFAULT_STREAM_SETTINGS);
  });

  it('replaces only the broken fields with the defaults', () => {
    const settings = parseStoredStreamSettings({ fontSize: 60, burndown: { label: 1 }, transitionEffect: 'spin' });
    expect(settings).toEqual({ ...DEFAULT_STREAM_SETTINGS, fontSize: 60 });
  });
});
