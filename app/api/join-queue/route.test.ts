// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it } from 'vitest';

import { __TEST_ONLY_resetJoinQueue } from '../../../lib/joinQueue';

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
    expect(publicView).toEqual({ open: true, current: null, entries: [{ position: 1, userName: 'ViewerA' }], revision: 2 });
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

  it.each([
    [{ action: 'join', userId: '1', userName: 'A', messageId: 'm' }, 'args が無い'],
    [{ ...joinBody, userId: '' }, 'userId が空'],
    [{ ...joinBody, args: 'あ'.repeat(201) }, 'args が長すぎる'],
    [{ action: 'cancel' }, 'cancel の userId が無い'],
    [{ action: 'reset' }, '知らない action'],
  ] as [unknown, string][])('rejects invalid requests (%s: %s)', async (body) => {
    expect((await post(body)).status).toBe(400);
  });

  it('rejects requests that are not JSON', async () => {
    expect((await post(JSON.stringify({ action: 'open' }), 'text/plain')).status).toBe(415);
    expect((await post('{', 'application/json')).status).toBe(400);
  });
});
