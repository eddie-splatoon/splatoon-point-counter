// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it } from 'vitest';

import { __TEST_ONLY_setDb, openDb } from '../../../lib/db';

import { DELETE, GET, PATCH, POST } from './route';

const url = (query = '') => `http://localhost/api/clip${query}`;

const send = (handler: typeof POST, method: string, body: unknown, contentType = 'application/json') =>
  handler(new NextRequest(url(), {
    method,
    headers: { 'Content-Type': contentType },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }));

const created = { status: 'created', clipId: 'FunnyClip', editUrl: 'https://clips.twitch.tv/FunnyClip/edit' };

beforeEach(() => {
  __TEST_ONLY_setDb(openDb(':memory:'));
});

describe('Clip API', () => {
  it('requests a clip and lists it', async () => {
    const response = await send(POST, 'POST', { source: 'button' });
    expect(response.status).toBe(200);
    const { clip } = await response.json();
    expect(clip).toMatchObject({ source: 'button', status: 'pending' });

    expect((await (await GET(new NextRequest(url()))).json()).clips).toEqual([clip]);
    expect((await (await GET(new NextRequest(url('?status=pending')))).json()).clips).toEqual([clip]);
  });

  it('defaults the source to voice', async () => {
    expect((await (await send(POST, 'POST', {})).json()).clip.source).toBe('voice');
  });

  it('rejects requests that are not JSON or have an invalid source', async () => {
    expect((await send(POST, 'POST', '{}', 'text/plain')).status).toBe(415);
    expect((await send(POST, 'POST', '{', 'application/json')).status).toBe(400);
    expect((await send(POST, 'POST', { source: 'chat' })).status).toBe(400);
    expect((await (await GET(new NextRequest(url()))).json()).clips).toEqual([]);
  });

  it('writes the result of a pending request', async () => {
    const { clip } = await (await send(POST, 'POST', {})).json();
    const response = await send(PATCH, 'PATCH', { id: clip.id, ...created });
    expect(response.status).toBe(200);
    expect((await response.json()).clip).toMatchObject({ status: 'created', clipId: 'FunnyClip' });
    expect((await (await GET(new NextRequest(url('?status=pending')))).json()).clips).toEqual([]);

    // 処理済み・無い依頼には書き込めない
    expect((await send(PATCH, 'PATCH', { id: clip.id, ...created })).status).toBe(404);
  });

  it('rejects an invalid result', async () => {
    const { clip } = await (await send(POST, 'POST', {})).json();
    expect((await send(PATCH, 'PATCH', { id: clip.id, ...created }, 'text/plain')).status).toBe(415);
    expect((await send(PATCH, 'PATCH', { id: clip.id, ...created, editUrl: 'http://example.com' })).status).toBe(400);
  });

  it('does not delete a pending request', async () => {
    const { clip } = await (await send(POST, 'POST', {})).json();
    expect((await DELETE(new NextRequest(url(`?id=${clip.id}`), { method: 'DELETE' }))).status).toBe(409);
  });

  it('deletes a clip from the history', async () => {
    const { clip } = await (await send(POST, 'POST', {})).json();
    await send(PATCH, 'PATCH', { id: clip.id, status: 'failed', error: 'offline' });
    expect((await DELETE(new NextRequest(url('?id=abc'), { method: 'DELETE' }))).status).toBe(400);
    expect((await DELETE(new NextRequest(url('?id=999'), { method: 'DELETE' }))).status).toBe(404);
    const response = await DELETE(new NextRequest(url(`?id=${clip.id}`), { method: 'DELETE' }));
    expect(response.status).toBe(200);
    expect((await response.json()).clips).toEqual([]);
  });
});
