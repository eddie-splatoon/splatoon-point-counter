// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it } from 'vitest';

import { __TEST_ONLY_resetBreak } from '../../../lib/break';
import { __TEST_ONLY_setDb, openDb } from '../../../lib/db';

import { GET, POST } from './route';

const send = (body: unknown, contentType = 'application/json') =>
  POST(new NextRequest('http://localhost/api/break', {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }));

beforeEach(() => {
  __TEST_ONLY_setDb(openDb(':memory:'));
  __TEST_ONLY_resetBreak();
});

describe('Break API', () => {
  it('starts and ends a break', async () => {
    expect((await (await GET()).json()).active).toBe(false);

    const started = await (await send({ action: 'start' })).json();
    expect(started).toMatchObject({ active: true, voiceHeardAt: null });
    expect(typeof started.startedAt).toBe('number');
    expect((await (await GET()).json()).active).toBe(true);

    expect((await (await send({ action: 'end' })).json()).active).toBe(false);
  });

  it('ends the break when the streamer says a resume phrase', async () => {
    await send({ action: 'start' });
    const response = await (await send({ action: 'heard', resume: true })).json();
    expect(response).toMatchObject({ active: false, result: 'ended' });
  });

  it('ignores speech when not on a break', async () => {
    expect(await (await send({ action: 'heard' })).json()).toMatchObject({ active: false, result: 'idle' });
  });

  it('rejects invalid requests', async () => {
    expect((await send({ action: 'start' }, 'text/plain')).status).toBe(415);
    expect((await send('{', 'application/json')).status).toBe(400);
    expect((await send({ action: 'pause' })).status).toBe(400);
    expect((await send({ action: 'heard', resume: 'yes' })).status).toBe(400);
    expect((await (await GET()).json()).active).toBe(false);
  });
});
