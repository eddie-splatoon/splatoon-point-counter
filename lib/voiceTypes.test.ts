import { describe, expect, it } from 'vitest';

import { MAX_SPEECH_LENGTH, getDefaultVoiceSettings, normalizeSpeechText, parseSpeakers, parseVoiceSettings, voiceCredit } from './voiceTypes';

describe('normalizeSpeechText', () => {
  it('joins lines and collapses spaces', () => {
    expect(normalizeSpeechText('  ナイス\n  です ')).toBe('ナイス です');
  });

  it('truncates long text', () => {
    expect(normalizeSpeechText('あ'.repeat(MAX_SPEECH_LENGTH + 10))).toBe('あ'.repeat(MAX_SPEECH_LENGTH));
  });

  it('returns null for empty text', () => {
    expect(normalizeSpeechText(' \n ')).toBeNull();
  });
});

describe('parseVoiceSettings', () => {
  const valid = { enabled: true, speakerId: 3, speakerName: ' ずんだもん ', speedScale: 1.2, volumeScale: 0.8 };

  it('accepts the default settings', () => {
    expect(parseVoiceSettings(getDefaultVoiceSettings())).toEqual(getDefaultVoiceSettings());
  });

  it('accepts valid settings and trims the speaker name', () => {
    expect(parseVoiceSettings(valid)).toEqual({ ...valid, speakerName: 'ずんだもん' });
  });

  it.each([
    ['nothing', null],
    ['a non-boolean enabled', { ...valid, enabled: 'yes' }],
    ['a negative speakerId', { ...valid, speakerId: -1 }],
    ['a non-integer speakerId', { ...valid, speakerId: 1.5 }],
    ['a too long speakerName', { ...valid, speakerName: 'あ'.repeat(51) }],
    ['a too fast speed', { ...valid, speedScale: 2.1 }],
    ['a too slow speed', { ...valid, speedScale: 0.4 }],
    ['a negative volume', { ...valid, volumeScale: -0.1 }],
    ['a non-finite volume', { ...valid, volumeScale: Infinity }],
  ])('rejects %s', (_, body) => {
    expect(typeof parseVoiceSettings(body)).toBe('string');
  });
});

describe('parseSpeakers', () => {
  it('keeps names and talk styles only', () => {
    expect(parseSpeakers([
      { name: 'ずんだもん', speaker_uuid: 'x', styles: [{ name: 'ノーマル', id: 3, type: 'talk' }, { name: 'ハミング', id: 3001, type: 'frame_decode' }] },
      { name: '四国めたん', styles: [{ name: 'あまあま', id: 0 }] },
      { name: '歌だけ', styles: [{ name: 'うた', id: 6000, type: 'sing' }] },
      { name: 1, styles: [] },
      null,
    ])).toEqual([
      { name: 'ずんだもん', styles: [{ id: 3, name: 'ノーマル' }] },
      { name: '四国めたん', styles: [{ id: 0, name: 'あまあま' }] },
    ]);
  });

  it('returns an empty list for an unexpected response', () => {
    expect(parseSpeakers({ message: 'error' })).toEqual([]);
  });
});

describe('voiceCredit', () => {
  it('formats the credit', () => {
    expect(voiceCredit('ずんだもん')).toBe('VOICEVOX:ずんだもん');
  });
});
