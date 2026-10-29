// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __TEST_ONLY_setDb, openDb, setAppState } from '../../../lib/db';
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
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Telop API', () => {
  it('returns the default presets and no telop at first', async () => {
    expect(await (await GET()).json()).toEqual({ presets: getDefaultTelopSettings().presets, current: null, revision: 0 });
  });

  it('shows a preset by id', async () => {
    const response = await POST(request('POST', { presetId: 3 }));

    expect(response.status).toBe(200);
    expect((await response.json()).current).toEqual({ id: 1, text: '満潮きた', timestamp: NOW });
    expect(await (await GET()).json()).toMatchObject({ current: { id: 1, text: '満潮きた' }, revision: 1 });
  });

  it('shows free text after normalizing it', async () => {
    await POST(request('POST', { presetId: 1 }));
    const data = await (await POST(request('POST', { text: '  ありがとう\nございます ' }))).json();

    expect(data.current).toEqual({ id: 2, text: 'ありがとう ございます', timestamp: NOW });
  });

  it('returns 404 for an unknown preset', async () => {
    expect((await POST(request('POST', { presetId: 99 }))).status).toBe(404);
    expect((await (await GET()).json()).current).toBeNull();
  });

  it.each([[{}], [{ text: '' }], [{ text: 'あ'.repeat(31) }], [{ text: 1 }]])('rejects %j', async (body) => {
    expect((await POST(request('POST', body))).status).toBe(400);
  });

  it('rejects requests that are not JSON', async () => {
    expect((await POST(request('POST', '{"presetId":1}', 'text/plain'))).status).toBe(415);
    expect((await PUT(request('PUT', '{"presets":[]}', 'text/plain'))).status).toBe(415);
    expect((await POST(request('POST', '{', 'application/json'))).status).toBe(400);
  });

  it('saves presets and uses them for showing', async () => {
    const presets = [{ id: 7, text: 'カンスト!', speak: true }];
    const response = await PUT(request('PUT', { presets }));

    expect(response.status).toBe(200);
    expect((await (await GET()).json()).presets).toEqual(presets);
    expect((await (await POST(request('POST', { presetId: 7 }))).json()).current.text).toBe('カンスト!');
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
});
