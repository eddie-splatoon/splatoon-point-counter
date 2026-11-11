// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it } from 'vitest';

import { __TEST_ONLY_setDb, openDb } from '../../../../lib/db';
import { getSummary } from '../../../../lib/salmon';
import { GET as getScoreDisplay } from '../../score-display/route';

import { GET, PATCH, POST } from './route';

const url = (query = '') => `http://localhost/api/salmon/import${query}`;

const send = (handler: typeof POST, method: string, body: unknown, contentType = 'application/json') =>
  handler(new NextRequest(url(), {
    method,
    headers: { 'Content-Type': contentType },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }));

const job = { goldenEggs: 70, bossKills: 9, deaths: 1, cleared: false, waveReached: 2, stage: 'トキシラズいぶし工房', weapons: [] };

const importJobs = async (jobs: unknown[]) => {
  const { import: requested } = await (await send(POST, 'POST', {})).json();
  await send(PATCH, 'PATCH', { id: requested.id, status: 'processing' });
  return send(PATCH, 'PATCH', { id: requested.id, status: 'succeeded', jobs });
};

beforeEach(() => {
  __TEST_ONLY_setDb(openDb(':memory:'));
});

describe('Salmon import API', () => {
  it('requests an import, processes it and records the job', async () => {
    const { import: requested } = await (await send(POST, 'POST', {})).json();
    expect(requested).toMatchObject({ status: 'pending' });
    expect((await (await GET(new NextRequest(url('?status=pending')))).json()).imports).toEqual([requested]);

    expect((await send(PATCH, 'PATCH', { id: requested.id, status: 'processing' })).status).toBe(200);
    const response = await send(PATCH, 'PATCH', { id: requested.id, status: 'succeeded', jobs: [{ job, playedAt: '2026/11/10 21:05' }] });
    expect(response.status).toBe(200);
    expect((await response.json()).import).toMatchObject({ status: 'succeeded', jobId: getSummary().lastJob!.id });
    expect((await (await GET(new NextRequest(url()))).json()).imports[0]).toMatchObject({ id: requested.id, status: 'succeeded' });
  });

  it('rejects requests that are not JSON', async () => {
    expect((await send(POST, 'POST', '{}', 'text/plain')).status).toBe(415);
    expect((await send(PATCH, 'PATCH', '{}', 'text/plain')).status).toBe(415);
    expect((await send(POST, 'POST', '{', 'application/json')).status).toBe(400);
  });

  it('returns 400 for invalid results, 404 for unknown requests and 409 for an already imported job', async () => {
    expect((await send(PATCH, 'PATCH', { id: 1, status: 'nope' })).status).toBe(400);
    expect((await send(PATCH, 'PATCH', { id: 99, status: 'processing' })).status).toBe(404);

    const importJob = () => importJobs([{ job, playedAt: '2026/11/10 21:05' }]);
    expect((await importJob()).status).toBe(200);
    expect((await importJob()).status).toBe(409);
    expect(await (await GET(new NextRequest(url('?view=recorded')))).json()).toEqual({ playedAt: ['2026/11/10 21:05'], sessionStartedAt: expect.any(Number) });
    expect(getSummary().jobs).toHaveLength(1);
  });

  it('updates the score display with the grade of the latest regular job', async () => {
    const regular = { ...job, jobKind: 'regular' };
    const response = await importJobs([
      { job: regular, playedAt: '2026/11/10 21:05', details: { gradeName: 'でんせつ', gradePoint: 700 } },
      { job: regular, playedAt: '2026/11/10 21:15', details: { gradeName: 'でんせつ', gradePoint: 720 } },
    ]);
    expect(response.status).toBe(200);
    expect(await (await getScoreDisplay()).json()).toMatchObject({ scoreLabel: '現在のバイト評価', scoreValue: '720' });
  });

  it('keeps the score display when the kind of the job is unknown', async () => {
    expect((await importJobs([{ job, playedAt: '2026/11/10 21:05', details: { gradeName: 'でんせつ', gradePoint: 720 } }])).status).toBe(200);
    expect(await (await getScoreDisplay()).json()).toMatchObject({ scoreValue: '400+' });
  });
});
