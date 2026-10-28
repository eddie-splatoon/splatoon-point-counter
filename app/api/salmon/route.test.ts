// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it } from 'vitest';

import { __TEST_ONLY_setDb, openDb } from '../../../lib/db';
import { startSession } from '../../../lib/salmon';

import { DELETE, GET, POST } from './route';

const url = (query = '') => `http://localhost/api/salmon${query}`;

const post = (body: unknown, contentType = 'application/json') =>
  POST(new NextRequest(url(), {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }));

const job = { goldenEggs: 30, bossKills: 12, deaths: 1, cleared: true, stage: 'アラマキ砦' };

beforeEach(() => {
  __TEST_ONLY_setDb(openDb(':memory:'));
});

describe('Salmon API', () => {
  describe('GET', () => {
    it('returns an empty summary before anything is recorded', async () => {
      const response = await GET(new NextRequest(url()));
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ session: null, lastJob: null, jobs: [] });
    });

    it('returns the summary of a past session', async () => {
      await post(job);
      const past = (await (await GET(new NextRequest(url()))).json()).session;
      startSession('next');

      const body = await (await GET(new NextRequest(url(`?sessionId=${past.id}`)))).json();
      expect(body.session.id).toBe(past.id);
      expect(body.totals.goldenEggs).toBe(30);
    });

    it('returns 400 for an invalid sessionId and 404 for an unknown one', async () => {
      expect((await GET(new NextRequest(url('?sessionId=abc')))).status).toBe(400);
      expect((await GET(new NextRequest(url('?sessionId=999')))).status).toBe(404);
    });
  });

  describe('POST', () => {
    it('records a job and returns the updated summary', async () => {
      const response = await post(job);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.lastJob).toMatchObject({ ...job, waveReached: 3 });
      expect(body.totals).toMatchObject({ jobs: 1, goldenEggs: 30, clears: 1, failures: 0 });
    });

    it('returns 400 for an invalid job without recording it', async () => {
      const response = await post({ ...job, cleared: false });
      expect(response.status).toBe(400);
      expect((await (await GET(new NextRequest(url()))).json()).totals.jobs).toBe(0);
    });

    it('returns 400 for invalid JSON', async () => {
      expect((await post('{invalid')).status).toBe(400);
    });

    it('returns 415 when Content-Type is not JSON', async () => {
      expect((await post(JSON.stringify(job), 'text/plain')).status).toBe(415);
      expect((await (await GET(new NextRequest(url()))).json()).totals.jobs).toBe(0);
    });
  });

  describe('DELETE', () => {
    it('deletes a job and returns the updated summary', async () => {
      const { lastJob } = await (await post(job)).json();

      const response = await DELETE(new NextRequest(url(`?id=${lastJob.id}`), { method: 'DELETE' }));
      expect(response.status).toBe(200);
      expect((await response.json()).totals.jobs).toBe(0);
    });

    it('returns 400 for an invalid id and 404 for an unknown one', async () => {
      expect((await DELETE(new NextRequest(url('?id=x'), { method: 'DELETE' }))).status).toBe(400);
      expect((await DELETE(new NextRequest(url(), { method: 'DELETE' }))).status).toBe(400);
      expect((await DELETE(new NextRequest(url('?id=999'), { method: 'DELETE' }))).status).toBe(404);
    });
  });
});
