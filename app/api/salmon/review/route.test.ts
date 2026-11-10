// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it } from 'vitest';

import { __TEST_ONLY_setDb, openDb } from '../../../../lib/db';
import { addJob, startSession } from '../../../../lib/salmon';

import { GET } from './route';

const url = (query = '') => `http://localhost/api/salmon/review${query}`;
const job = { goldenEggs: 30, bossKills: 12, deaths: 1, cleared: true, waveReached: 3, stage: 'アラマキ砦', weapons: [] };

beforeEach(() => {
  __TEST_ONLY_setDb(openDb(':memory:'));
});

describe('GET /api/salmon/review', () => {
  it('returns the review of the current session', async () => {
    startSession('', 1000);
    addJob(job, 1100);
    const response = await GET(new NextRequest(url()));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ totals: { jobs: 1, goldenEggs: 30 }, jobs: [{ goldenEggs: 30 }] });
  });

  it('returns the review of a past session', async () => {
    const past = startSession('', 1000);
    addJob(job, 1100);
    startSession('', 2000);
    const response = await GET(new NextRequest(url(`?sessionId=${past.id}`)));
    expect(await response.json()).toMatchObject({ session: { id: past.id }, totals: { jobs: 1 } });
  });

  it('rejects an invalid or unknown session', async () => {
    expect((await GET(new NextRequest(url('?sessionId=abc')))).status).toBe(400);
    expect((await GET(new NextRequest(url('?sessionId=9')))).status).toBe(404);
  });
});
