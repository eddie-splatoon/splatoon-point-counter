// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it } from 'vitest';

import { __TEST_ONLY_setDb, openDb } from '../../../lib/db';
import { __TEST_ONLY_resetScreenStamp } from '../../../lib/screenStamp';
import { DEFAULT_SCREEN_STAMP_SETTINGS } from '../../../lib/screenStampTypes';

import { GET, POST, PUT } from './route';

const URL_BASE = 'http://localhost/api/screen-stamp';
const request = (method: 'POST' | 'PUT', body: unknown, contentType = 'application/json') =>
  new NextRequest(URL_BASE, { method, headers: { 'Content-Type': contentType }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const get = async (query = '') => (await GET(new NextRequest(`${URL_BASE}${query}`))).json();

beforeEach(() => {
  __TEST_ONLY_setDb(openDb(':memory:'));
  __TEST_ONLY_resetScreenStamp();
});

describe('Screen stamp API', () => {
  it('shows a stamp for a matching chat message', async () => {
    expect((await get()).current).toBeNull();
    const res = await POST(request('POST', { action: 'chat', userId: '1', text: 'ナイス!!' }));
    expect(await res.json()).toEqual({ result: 'shown', stampId: 'nice' });
    expect((await get()).current).toMatchObject({ stampId: 'nice', label: 'ナイス' });

    expect(await (await POST(request('POST', { action: 'chat', userId: '2', text: 'ドンマイ' }))).json()).toEqual({ result: 'throttled', stampId: 'donmai' });
    expect(await (await POST(request('POST', { action: 'chat', userId: '2', text: 'ナイスじゃない' }))).json()).toEqual({ result: 'none', stampId: null });
  });

  it('closes the stream stats on offline', async () => {
    await POST(request('POST', { action: 'chat', userId: '1', text: 'ナイス' }));
    expect(await (await POST(request('POST', { action: 'offline' }))).json()).toEqual({ result: 'closed' });
    const { windows } = await get('?view=stats');
    expect(windows).toHaveLength(1);
    expect(typeof windows[0].endedAt).toBe('number');
  });

  it('rejects non-JSON and invalid requests', async () => {
    expect((await POST(request('POST', 'action=chat', 'text/plain'))).status).toBe(415);
    expect((await POST(request('POST', '{', 'application/json'))).status).toBe(400);
    expect((await POST(request('POST', { action: 'shout' }))).status).toBe(400);
    expect((await POST(request('POST', { action: 'chat', text: 'ナイス' }))).status).toBe(400);
    expect((await POST(request('POST', { action: 'chat', userId: '1', text: 'あ'.repeat(51) }))).status).toBe(400);
    expect((await POST(request('POST', { action: 'chat', userId: '1', text: '', emotes: [1] }))).status).toBe(400);
    expect((await PUT(request('PUT', { settings: {} }, 'text/plain'))).status).toBe(415);
  });

  it('saves and returns the settings', async () => {
    expect(await get('?view=settings')).toEqual(DEFAULT_SCREEN_STAMP_SETTINGS);
    const settings = { enabled: true, stamps: [{ id: 'tasukaru', label: 'たすかる', words: ['たすかった'], emotes: [], imageUrl: null }] };
    expect(await (await PUT(request('PUT', { settings }))).json()).toEqual(settings);
    expect(await get('?view=settings')).toEqual(settings);
    expect(await (await POST(request('POST', { action: 'chat', userId: '1', text: 'たすかった〜' }))).json()).toMatchObject({ result: 'shown' });

    expect((await PUT(request('PUT', { settings: { enabled: true, stamps: [{ id: 'x', label: '' , words: [] }] } }))).status).toBe(400);
  });
});
