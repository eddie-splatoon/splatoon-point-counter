// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __TEST_ONLY_setDb, openDb, setAppState } from './db';
import { VOICE_STATE_KEY, __TEST_ONLY_resetSpeechQueue, enqueueSpeech, fetchSpeakers, findSpeech, listSpeech, synthesize } from './speech';
import { MAX_SPEECH_QUEUE, SPEECH_TTL_MS, getDefaultVoiceSettings } from './voiceTypes';

const enabled = { ...getDefaultVoiceSettings(), enabled: true, speakerId: 3, speakerName: 'ずんだもん' };
const NOW = 1_700_000_000_000;

beforeEach(() => {
  __TEST_ONLY_setDb(openDb(':memory:'));
  __TEST_ONLY_resetSpeechQueue();
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('speech queue', () => {
  it('does not enqueue while speech is disabled', () => {
    expect(enqueueSpeech('ナイス!')).toBeNull();
    expect(listSpeech()).toEqual([]);
  });

  it('does not enqueue without a speaker', () => {
    setAppState(VOICE_STATE_KEY, { ...enabled, speakerId: null });
    expect(enqueueSpeech('ナイス!')).toBeNull();
  });

  it('enqueues normalized text with increasing ids', () => {
    setAppState(VOICE_STATE_KEY, enabled);
    expect(enqueueSpeech(' ナイス! ')).toEqual({ id: 1, text: 'ナイス!', createdAt: NOW });
    expect(enqueueSpeech('ヘルプ感謝')?.id).toBe(2);
    expect(findSpeech(2)?.text).toBe('ヘルプ感謝');
    expect(enqueueSpeech('  ')).toBeNull();
  });

  it('drops old items', () => {
    setAppState(VOICE_STATE_KEY, enabled);
    enqueueSpeech('古い');
    vi.mocked(Date.now).mockReturnValue(NOW + SPEECH_TTL_MS);
    enqueueSpeech('新しい');
    expect(listSpeech().map((item) => item.text)).toEqual(['新しい']);
    expect(findSpeech(1)).toBeUndefined();
  });

  it('keeps at most the maximum number of items', () => {
    setAppState(VOICE_STATE_KEY, enabled);
    for (let i = 0; i < MAX_SPEECH_QUEUE + 5; i++) enqueueSpeech(`${i}`);
    const items = listSpeech();
    expect(items).toHaveLength(MAX_SPEECH_QUEUE);
    expect(items[0].text).toBe('5');
  });
});

describe('VOICEVOX', () => {
  it('fetches speakers', async () => {
    const fetchMock = vi.fn(async () => Response.json([{ name: 'ずんだもん', styles: [{ name: 'ノーマル', id: 3 }] }]));
    vi.stubGlobal('fetch', fetchMock);

    expect(await fetchSpeakers()).toEqual([{ name: 'ずんだもん', styles: [{ id: 3, name: 'ノーマル' }] }]);
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:50021/speakers', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('synthesizes with the speed and volume from the settings', async () => {
    const fetchMock = vi.fn(async (url: string) => url.includes('/audio_query')
      ? Response.json({ speedScale: 1, volumeScale: 1, pitchScale: 0 })
      : new Response(new Uint8Array([1, 2, 3])));
    vi.stubGlobal('fetch', fetchMock);

    const wav = await synthesize('ナイス & 感謝', { ...enabled, speedScale: 1.5, volumeScale: 0.5 });

    expect(new Uint8Array(wav)).toEqual(new Uint8Array([1, 2, 3]));
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:50021/audio_query?text=%E3%83%8A%E3%82%A4%E3%82%B9%20%26%20%E6%84%9F%E8%AC%9D&speaker=3');
    const [synthesisUrl, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(synthesisUrl).toBe('http://localhost:50021/synthesis?speaker=3');
    expect(JSON.parse(String(init.body))).toEqual({ speedScale: 1.5, volumeScale: 0.5, pitchScale: 0 });
  });

  it('throws when VOICEVOX returns an error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('error', { status: 500 })));
    await expect(fetchSpeakers()).rejects.toThrow('500');
  });
});
