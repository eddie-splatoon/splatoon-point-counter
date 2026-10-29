// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __TEST_ONLY_setDb, openDb, setAppState } from './db';
import { MAX_WAV_BYTES, VOICE_STATE_KEY, __TEST_ONLY_resetSpeechQueue, enqueueSpeech, fetchSpeakers, findSpeech, listSpeech, synthesize, synthesizeSpeech } from './speech';
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
    expect(enqueueSpeech(' ナイス! ')).toEqual({ id: NOW, text: 'ナイス!', createdAt: NOW });
    expect(enqueueSpeech('ヘルプ感謝')?.id).toBe(NOW + 1);
    expect(findSpeech(NOW + 1)?.text).toBe('ヘルプ感謝');
    expect(enqueueSpeech('  ')).toBeNull();
  });

  it('drops old items', () => {
    setAppState(VOICE_STATE_KEY, enabled);
    enqueueSpeech('古い');
    vi.mocked(Date.now).mockReturnValue(NOW + SPEECH_TTL_MS);
    enqueueSpeech('新しい');
    expect(listSpeech().map((item) => item.text)).toEqual(['新しい']);
    expect(findSpeech(NOW)).toBeUndefined();
  });

  it('starts ids from the current time so they keep increasing after a server restart', () => {
    setAppState(VOICE_STATE_KEY, enabled);
    enqueueSpeech('再起動前');
    __TEST_ONLY_resetSpeechQueue();
    vi.mocked(Date.now).mockReturnValue(NOW + 5_000);

    expect(enqueueSpeech('再起動後')?.id).toBe(NOW + 5_000);
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

  it('rejects a wav larger than the limit', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('/audio_query')
      ? Response.json({})
      : new Response('x', { headers: { 'Content-Length': String(MAX_WAV_BYTES + 1) } })));

    await expect(synthesize('ナイス', enabled)).rejects.toThrow('too large');
  });

  it('rejects an unexpected audio query', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json([1, 2])));
    await expect(synthesize('ナイス', enabled)).rejects.toThrow('unexpected audio query');
  });

  it('synthesizes each queued item only once', async () => {
    setAppState(VOICE_STATE_KEY, enabled);
    const item = enqueueSpeech('ナイス')!;
    const fetchMock = vi.fn(async (url: string) => url.includes('/audio_query') ? Response.json({}) : new Response(new Uint8Array([1])));
    vi.stubGlobal('fetch', fetchMock);

    await Promise.all([synthesizeSpeech(item, enabled), synthesizeSpeech(item, enabled)]);
    await synthesizeSpeech(item, enabled);

    expect(fetchMock).toHaveBeenCalledTimes(2); // audio_query と synthesis を1回ずつ
  });

  it('synthesizes again after a failure', async () => {
    setAppState(VOICE_STATE_KEY, enabled);
    const item = enqueueSpeech('ナイス')!;
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    await expect(synthesizeSpeech(item, enabled)).rejects.toThrow();

    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('/audio_query') ? Response.json({}) : new Response(new Uint8Array([9]))));
    expect(new Uint8Array(await synthesizeSpeech(item, enabled))).toEqual(new Uint8Array([9]));
  });
});
