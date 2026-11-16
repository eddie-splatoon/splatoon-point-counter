// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __TEST_ONLY_setDb, openDb } from '../../../lib/db';
import { __TEST_ONLY_resetJoinQueue } from '../../../lib/joinQueue';
import { __TEST_ONLY_resetSalmonScheduleCache } from '../../../lib/salmonScheduleFetch';
import { __TEST_ONLY_resetTelop, expireChatPosts } from '../../../lib/telop';

import { GET, POST } from './route';

const url = (query = '') => `http://localhost/api/join-queue${query}`;

const post = (body: unknown, contentType = 'application/json') =>
  POST(new NextRequest(url(), {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }));

const joinBody = { action: 'join', userId: '999', userName: 'ViewerA', messageId: 'm1', args: 'でんせつ820' };

beforeEach(() => {
  __TEST_ONLY_resetJoinQueue();
  __TEST_ONLY_resetTelop();
  __TEST_ONLY_resetSalmonScheduleCache();
  __TEST_ONLY_setDb(openDb(':memory:'));
  // スケジュールは取れない（シフトの区切りはわからない）
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Join queue API', () => {
  it('joins from the chat and returns the reply', async () => {
    await post({ action: 'open' });
    const response = await post(joinBody);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ result: 'joined', position: 1, reply: expect.stringContaining('ViewerA さん、受付しました') });
  });

  it('returns the public view by default and the ratings only with view=panel', async () => {
    await post({ action: 'open' });
    await post(joinBody);

    const publicView = await (await GET(new NextRequest(url()))).json();
    expect(publicView).toEqual({ open: true, current: null, entries: [{ position: 1, userName: 'ViewerA' }], hazard: { value: 320, unknown: 1, wild: 2 }, revision: 2 });
    const panelView = await (await GET(new NextRequest(url('?view=panel')))).json();
    expect(panelView.entries[0]).toMatchObject({ userId: '999', rating: { tier: 8, points: 820 } });
  });

  it('cancels, calls next, removes and closes', async () => {
    await post({ action: 'open' });
    await post(joinBody);
    await post({ ...joinBody, userId: '2', messageId: 'm2' });
    await post({ ...joinBody, userId: '3', messageId: 'm3' });

    expect(await (await post({ action: 'cancel', userId: '3' })).json()).toMatchObject({ result: 'cancelled' });
    expect(await (await post({ action: 'next' })).json()).toMatchObject({ current: { userId: '999' }, entries: [{ userId: '2' }] });
    expect(await (await post({ action: 'remove', userId: '2' })).json()).toMatchObject({ entries: [] });
    expect((await post({ action: 'remove', userId: '2' })).status).toBe(404);
    expect(await (await post({ action: 'close' })).json()).toMatchObject({ open: false, current: null, entries: [] });
  });

  it('removes people by a deleted message or a ban, without failing when they are not in the queue', async () => {
    await post({ action: 'open' });
    await post(joinBody);
    await post({ ...joinBody, userId: '2', messageId: 'm2' });

    expect(await (await post({ action: 'removeMessage', messageId: 'm1' })).json()).toEqual({ removed: true });
    expect(await (await post({ action: 'removeMessage', messageId: 'm1' })).json()).toEqual({ removed: false });
    expect(await (await post({ action: 'removeUser', userId: '2' })).json()).toEqual({ removed: true });
    expect((await (await GET(new NextRequest(url()))).json()).entries).toEqual([]);
  });

  it('closes the queue when the stream goes offline and keeps the counts', async () => {
    await post({ action: 'open' });
    await post(joinBody);
    expect((await post({ action: 'offline' })).status).toBe(200);
    const panel = await (await GET(new NextRequest(url('?view=panel')))).json();
    expect(panel).toMatchObject({ open: false, entries: [], history: [{ joined: 1, called: 0, repeated: 0 }] });
  });

  it('shows the reconnect notice until dismissed', async () => {
    await post({ action: 'reconnected' });
    expect((await (await GET(new NextRequest(url('?view=panel')))).json()).reconnectedAt).toEqual(expect.any(Number));
    expect(await (await post({ action: 'dismissReconnect' })).json()).toMatchObject({ reconnectedAt: null });
  });

  it('sets the streamer rating and shows the estimate', async () => {
    await post({ action: 'open' });
    await post(joinBody);
    const response = await post({ action: 'streamer', rating: 'でんせつ820' });
    // (1620 + 1620) / 2 = 1620 → 324%
    expect(await response.json()).toMatchObject({ streamer: { source: 'manual' }, room: { estimate: 324, counted: 2, wild: 2 } });
    expect((await post({ action: 'streamer', rating: 'あいうえお' })).status).toBe(400);
    expect(await (await post({ action: 'streamer', rating: null })).json()).toMatchObject({ streamer: null });
  });

  it('marks ratings from before the current regular shift as stale once the schedule is cached', async () => {
    const start = Date.now() - 60_000;
    const entry = { start_time: new Date(start).toISOString(), end_time: new Date(start + 7_200_000).toISOString(), stage: { name: 'S', image: 'https://example.com/s.png' }, weapons: [] };
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      new Response(JSON.stringify({ results: url.endsWith('/coop-grouping/schedule') ? [entry] : [] }))));
    // 1 回目は待たずに返り、裏でスケジュールを取る
    expect((await (await GET(new NextRequest(url('?view=panel')))).json()).shiftStart).toBeNull();
    await vi.waitFor(async () => expect((await (await GET(new NextRequest(url('?view=panel')))).json()).shiftStart).toBe(start));
  });

  it('queues an announcement to the chat, read aloud', async () => {
    await post({ action: 'streamer', rating: 'でんせつ820' });
    expect((await post({ action: 'announce', kind: 'private' })).status).toBe(200);
    expect(expireChatPosts()).toEqual([expect.objectContaining({ text: expect.stringContaining('今日のおすすめは 325%、でんせつ 825 相当です'), speak: true })]);
    expect((await post({ action: 'announce', kind: 'other' })).status).toBe(400);
  });

  it.each([
    [{ action: 'join', userId: '1', userName: 'A', messageId: 'm' }, 'args が無い'],
    [{ ...joinBody, userId: '' }, 'userId が空'],
    [{ ...joinBody, args: 'あ'.repeat(201) }, 'args が長すぎる'],
    [{ action: 'cancel' }, 'cancel の userId が無い'],
    [{ ...joinBody, attached: 'yes' }, 'attached が boolean でない'],
    [{ action: 'reset' }, '知らない action'],
    [{ action: 'streamer', rating: 1 }, 'streamer の rating が文字列でない'],
    [{ action: 'removeMessage' }, 'removeMessage の messageId が無い'],
    [{ action: 'removeUser', userId: '' }, 'removeUser の userId が空'],
  ] as [unknown, string][])('rejects invalid requests (%s: %s)', async (body) => {
    expect((await post(body)).status).toBe(400);
  });

  it('rejects requests that are not JSON', async () => {
    expect((await post(JSON.stringify({ action: 'open' }), 'text/plain')).status).toBe(415);
    expect((await post('{', 'application/json')).status).toBe(400);
  });
});
