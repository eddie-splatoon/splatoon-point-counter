// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it } from 'vitest';

import { __TEST_ONLY_setDb, openDb } from '../../../lib/db';
import { addJob } from '../../../lib/salmon';

import { GET, PATCH, POST } from './route';

const URL = 'http://localhost/api/weapon-card';

const patch = (body: unknown, contentType = 'application/json') =>
  PATCH(new NextRequest(URL, {
    method: 'PATCH',
    headers: { 'Content-Type': contentType },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }));

const post = (contentType = 'application/json') =>
  POST(new NextRequest(URL, { method: 'POST', headers: { 'Content-Type': contentType }, body: '{}' }));

beforeEach(() => {
  __TEST_ONLY_setDb(openDb(':memory:'));
});

describe('Weapon card API', () => {
  it('returns the weapons filled by recorded jobs', async () => {
    addJob({ goldenEggs: 30, bossKills: 12, deaths: 1, cleared: true, waveReached: 3, stage: '', weapons: ['sshooter'] }, 1000);

    const body = await (await GET()).json();
    expect(body).toEqual({ startedAt: 0, total: 71, obtained: [{ key: 'sshooter', at: 1000, source: 'job' }] });
  });

  it('fills a weapon manually', async () => {
    const response = await patch({ weapon: 'pablo', obtained: true });
    expect(response.status).toBe(200);
    expect((await response.json()).obtained).toMatchObject([{ key: 'pablo', source: 'manual' }]);
  });

  it('starts a new card', async () => {
    await patch({ weapon: 'pablo', obtained: true });

    const response = await post();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.obtained).toEqual([]);
    expect(body.startedAt).toBeGreaterThan(0);
  });

  it('returns 400 for an invalid body or JSON', async () => {
    expect((await patch({ weapon: 'splatscope', obtained: true })).status).toBe(400);
    expect((await patch('{')).status).toBe(400);
  });

  it('returns 415 without a JSON content type', async () => {
    expect((await patch({ weapon: 'pablo', obtained: true }, 'text/plain')).status).toBe(415);
    expect((await post('text/plain')).status).toBe(415);
  });
});
