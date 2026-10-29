// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __TEST_ONLY_setDb, openDb, setAppState } from '../../../lib/db';
import { VOICE_STATE_KEY, __TEST_ONLY_resetSpeechQueue } from '../../../lib/speech';
import { getDefaultVoiceSettings } from '../../../lib/voiceTypes';

import { GET as getAudio } from './audio/route';
import { GET, POST } from './route';

const NOW = 1_700_000_000_000;
const enabled = { ...getDefaultVoiceSettings(), enabled: true, speakerId: 3, speakerName: 'ずんだもん' };

const post = (body: unknown, contentType = 'application/json') =>
  POST(new NextRequest('http://localhost/api/speech', {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }));

const audio = (id: string) => getAudio(new NextRequest(`http://localhost/api/speech/audio?id=${id}`));

beforeEach(() => {
  __TEST_ONLY_setDb(openDb(':memory:'));
  __TEST_ONLY_resetSpeechQueue();
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Speech API', () => {
  it('returns an empty queue at first', async () => {
    expect(await (await GET()).json()).toEqual({ items: [], serverTime: NOW });
  });

  it('enqueues text when speech is enabled', async () => {
    setAppState(VOICE_STATE_KEY, enabled);
    const response = await post({ text: 'テスト' });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: 1, text: 'テスト', createdAt: NOW });
    expect((await (await GET()).json()).items).toHaveLength(1);
  });

  it('returns 409 while speech is disabled', async () => {
    expect((await post({ text: 'テスト' })).status).toBe(409);
  });

  it.each([[{}], [{ text: '' }], [{ text: 1 }]])('rejects %j', async (body) => {
    expect((await post(body)).status).toBe(400);
  });

  it('rejects requests that are not JSON', async () => {
    expect((await post('{"text":"a"}', 'text/plain')).status).toBe(415);
    expect((await post('{', 'application/json')).status).toBe(400);
  });
});

describe('Speech audio API', () => {
  it('returns the synthesized wav for a queued item', async () => {
    setAppState(VOICE_STATE_KEY, enabled);
    await post({ text: 'テスト' });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('/audio_query') ? Response.json({}) : new Response(new Uint8Array([1, 2]))));

    const response = await audio('1');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('audio/wav');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2]));
  });

  it.each([['an unknown id', '9'], ['a non-numeric id', 'abc'], ['no id', '']])('returns 404 for %s', async (_, id) => {
    expect((await audio(id)).status).toBe(404);
  });

  it('returns 409 when speech was disabled after queuing', async () => {
    setAppState(VOICE_STATE_KEY, enabled);
    await post({ text: 'テスト' });
    setAppState(VOICE_STATE_KEY, { ...enabled, enabled: false });

    expect((await audio('1')).status).toBe(409);
  });

  it('returns 502 when VOICEVOX fails', async () => {
    setAppState(VOICE_STATE_KEY, enabled);
    await post({ text: 'テスト' });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));

    expect((await audio('1')).status).toBe(502);
  });
});
