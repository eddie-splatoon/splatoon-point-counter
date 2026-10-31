// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it } from 'vitest';

import { __TEST_ONLY_setDb, openDb } from '../../../../lib/db';
import { addJob, getCurrentSession } from '../../../../lib/salmon';
import { MAX_TITLE_LENGTH } from '../../../../lib/salmonTypes';

import { GET, POST } from './route';

const post = (body: unknown, contentType = 'application/json') =>
  POST(new NextRequest('http://localhost/api/salmon/sessions', {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }));

beforeEach(() => {
  __TEST_ONLY_setDb(openDb(':memory:'));
});

describe('Salmon sessions API', () => {
  it('starts a new session that becomes the current one', async () => {
    const response = await post({ title: '  土曜の配信 ' });
    const session = await response.json();

    expect(response.status).toBe(200);
    expect(session).toMatchObject({ title: '土曜の配信' });
    expect(getCurrentSession()).toEqual(session);
  });

  it('allows starting a session without a title', async () => {
    expect(await (await post({})).json()).toMatchObject({ title: '' });
  });

  it('truncates a long title', async () => {
    const session = await (await post({ title: 'あ'.repeat(MAX_TITLE_LENGTH + 5) })).json();
    expect(session.title).toHaveLength(MAX_TITLE_LENGTH);
  });

  it('lists sessions newest first with totals', async () => {
    addJob({ goldenEggs: 30, bossKills: 12, deaths: 1, cleared: true, waveReached: 3, stage: '', weapons: [] });
    await post({ title: 'second' });

    const sessions = await (await GET()).json();
    expect(sessions.map((s: { title: string }) => s.title)).toEqual(['second', '']);
    expect(sessions[1].totals).toMatchObject({ jobs: 1, goldenEggs: 30 });
  });

  it.each([
    ['a non-string title', { title: 1 }, 400],
    ['invalid JSON', '{invalid', 400],
  ])('returns 400 for %s', async (_, body, status) => {
    expect((await post(body)).status).toBe(status);
    expect(getCurrentSession()).toBeNull();
  });

  it('returns 415 when Content-Type is not JSON', async () => {
    expect((await post('{}', 'text/plain')).status).toBe(415);
    expect(getCurrentSession()).toBeNull();
  });
});
