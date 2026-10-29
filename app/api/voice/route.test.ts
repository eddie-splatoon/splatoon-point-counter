// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __TEST_ONLY_setDb, openDb, setAppState } from '../../../lib/db';
import { getDefaultVoiceSettings } from '../../../lib/voiceTypes';

import { GET, POST } from './route';
import { GET as getSpeakers } from './speakers/route';

const post = (body: unknown, contentType = 'application/json') =>
  POST(new NextRequest('http://localhost/api/voice', {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }));

const settings = { enabled: true, speakerId: 3, speakerName: 'ずんだもん', speedScale: 1.2, volumeScale: 0.8 };

beforeEach(() => {
  __TEST_ONLY_setDb(openDb(':memory:'));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Voice settings API', () => {
  it('returns the default settings (disabled) before anything is saved', async () => {
    expect(await (await GET()).json()).toEqual(getDefaultVoiceSettings());
  });

  it('saves settings and returns them on GET', async () => {
    const response = await post(settings);

    expect(response.status).toBe(200);
    expect(await (await GET()).json()).toEqual(settings);
  });

  it('rejects invalid settings without saving them', async () => {
    expect((await post({ ...settings, speedScale: 5 })).status).toBe(400);
    expect(await (await GET()).json()).toEqual(getDefaultVoiceSettings());
  });

  it('rejects requests that are not JSON', async () => {
    expect((await post(JSON.stringify(settings), 'text/plain')).status).toBe(415);
  });

  it('falls back to the default settings when the saved ones are invalid', async () => {
    setAppState('voice', { enabled: 'broken' });
    expect(await (await GET()).json()).toEqual(getDefaultVoiceSettings());
  });
});

describe('Voice speakers API', () => {
  it('returns the VOICEVOX speakers', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json([{ name: 'ずんだもん', styles: [{ name: 'ノーマル', id: 3 }] }])));
    expect(await (await getSpeakers()).json()).toEqual([{ name: 'ずんだもん', styles: [{ id: 3, name: 'ノーマル' }] }]);
  });

  it('returns 502 when VOICEVOX is not running', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    expect((await getSpeakers()).status).toBe(502);
  });
});
