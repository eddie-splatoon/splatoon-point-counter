// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __TEST_ONLY_setDb, openDb, setAppState } from '../../../lib/db';
import { VOICE_STATE_KEY, __TEST_ONLY_resetSpeechQueue, listSpeech } from '../../../lib/speech';
import { getDefaultTelopSettings } from '../../../lib/telopTypes';

import { GET, POST, PUT, __TEST_ONLY_resetTelop } from './route';

const request = (method: 'POST' | 'PUT', body: unknown, contentType = 'application/json') =>
  new NextRequest('http://localhost/api/telop', {
    method,
    headers: { 'Content-Type': contentType },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const NOW = 1_700_000_000_000;

beforeEach(() => {
  __TEST_ONLY_setDb(openDb(':memory:'));
  __TEST_ONLY_resetTelop();
  __TEST_ONLY_resetSpeechQueue();
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Telop API', () => {
  it('returns the default presets and no telop at first', async () => {
    expect(await (await GET()).json()).toEqual({ presets: getDefaultTelopSettings().presets, current: null, revision: 0, serverTime: NOW });
  });

  it('shows a preset by id', async () => {
    const response = await POST(request('POST', { presetId: 3 }));

    expect(response.status).toBe(200);
    expect((await response.json()).current).toEqual({ id: 1, text: '満潮きた', followFont: true, timestamp: NOW });
    expect(await (await GET()).json()).toMatchObject({ current: { id: 1, text: '満潮きた' }, revision: 1 });
  });

  it('shows free text after normalizing it', async () => {
    await POST(request('POST', { presetId: 1 }));
    const data = await (await POST(request('POST', { text: '  ありがとう\nございます ' }))).json();

    expect(data.current).toEqual({ id: 2, text: 'ありがとう ございます', followFont: true, timestamp: NOW });
  });

  it('shows free text without the common font when followFont is false', async () => {
    const data = await (await POST(request('POST', { text: 'ありがとう', followFont: false }))).json();

    expect(data.current).toMatchObject({ text: 'ありがとう', followFont: false });
  });

  it('returns 404 for an unknown preset', async () => {
    expect((await POST(request('POST', { presetId: 99 }))).status).toBe(404);
    expect((await (await GET()).json()).current).toBeNull();
  });

  it.each([[{}], [{ text: '' }], [{ text: 'あ'.repeat(31) }], [{ text: 1 }], [{ text: 'a', followFont: 'no' }]])('rejects %j', async (body) => {
    expect((await POST(request('POST', body))).status).toBe(400);
  });

  it('rejects requests that are not JSON', async () => {
    expect((await POST(request('POST', '{"presetId":1}', 'text/plain'))).status).toBe(415);
    expect((await PUT(request('PUT', '{"presets":[]}', 'text/plain'))).status).toBe(415);
    expect((await POST(request('POST', '{', 'application/json'))).status).toBe(400);
  });

  it('saves presets and uses them for showing', async () => {
    const presets = [{ id: 7, text: 'カンスト!', speak: true, followFont: false }];
    const response = await PUT(request('PUT', { presets }));

    expect(response.status).toBe(200);
    expect((await (await GET()).json()).presets).toEqual(presets);
    expect((await (await POST(request('POST', { presetId: 7 }))).json()).current).toMatchObject({ text: 'カンスト!', followFont: false });
    expect((await POST(request('POST', { presetId: 1 }))).status).toBe(404);
  });

  it('rejects invalid presets without saving them', async () => {
    expect((await PUT(request('PUT', { presets: [{ id: 1, text: '', speak: true }] }))).status).toBe(400);
    expect((await (await GET()).json()).presets).toEqual(getDefaultTelopSettings().presets);
  });

  it('falls back to the default presets when the saved ones are invalid', async () => {
    setAppState('telop', { presets: 'broken' });
    expect((await (await GET()).json()).presets).toEqual(getDefaultTelopSettings().presets);
  });

  describe('reading aloud', () => {
    beforeEach(() => {
      setAppState(VOICE_STATE_KEY, { enabled: true, speakerId: 3, speakerName: 'ずんだもん', speedScale: 1, volumeScale: 1 });
    });

    it('queues presets that are read aloud', async () => {
      await POST(request('POST', { presetId: 1 })); // ナイス! (speak: true)
      await POST(request('POST', { presetId: 2 })); // カタパッド残った… (speak: false)

      expect(listSpeech().map((item) => item.text)).toEqual(['ナイス!']);
    });

    it('does not queue a preset when speak is false', async () => {
      const response = await POST(request('POST', { presetId: 1, speak: false })); // ナイス! (speak: true)

      expect((await response.json()).current.text).toBe('ナイス!');
      expect(listSpeech()).toEqual([]);
    });

    it('rejects a non-boolean speak for a preset', async () => {
      expect((await POST(request('POST', { presetId: 1, speak: 'no' }))).status).toBe(400);
      expect(listSpeech()).toEqual([]);
    });

    it('queues free text only when speak is true', async () => {
      await POST(request('POST', { text: '読まない' }));
      await POST(request('POST', { text: '読む', speak: true }));

      expect(listSpeech().map((item) => item.text)).toEqual(['読む']);
    });

    it('rejects a non-boolean speak', async () => {
      expect((await POST(request('POST', { text: 'a', speak: 'yes' }))).status).toBe(400);
    });

    it('shows the telop without queuing while speech is disabled', async () => {
      setAppState(VOICE_STATE_KEY, { enabled: false, speakerId: 3, speakerName: 'ずんだもん', speedScale: 1, volumeScale: 1 });
      const response = await POST(request('POST', { presetId: 1 }));

      expect(response.status).toBe(200);
      expect(listSpeech()).toEqual([]);
    });
  });
});
