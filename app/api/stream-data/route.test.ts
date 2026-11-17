import { NextRequest } from 'next/server';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { __TEST_ONLY_setDb, openDb } from '../../../lib/db';
import { updateScoreDisplay } from '../../../lib/scoreDisplay';

import { GET, PATCH, POST, getInitialStreamData, __TEST_ONLY_setStreamData } from './route';

// Reset the stream data before each test
beforeEach(() => {
  __TEST_ONLY_setDb(openDb(':memory:'));
  __TEST_ONLY_setStreamData(getInitialStreamData());
});

const post = (body: unknown, contentType = 'application/json') =>
  POST(new NextRequest('http://localhost/api/stream-data', {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }));

describe('Stream Data API', () => {
  describe('GET', () => {
    it('returns the default settings before anything is saved', async () => {
      const response = await GET();
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual(getInitialStreamData());
      expect(body.settingsStored).toBe(false);
    });

    it('returns the score display saved separately', async () => {
      updateScoreDisplay({ scoreLabel: 'ハイスコア', scoreValue: '180' });
      const body = await (await GET()).json();
      expect(body).toMatchObject({ scoreLabel: 'ハイスコア', scoreValue: '180' });
    });
  });

  describe('POST', () => {
    it('updates only the sent settings and bumps the revision', async () => {
      const response = await post({ fontSize: 60 });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({ ...getInitialStreamData(), fontSize: 60, revision: 1, settingsStored: true });
    });

    it('keeps the settings in SQLite (survives a restart of the in-memory state)', async () => {
      const burndown = { label: 'あと', targetValue: 100, entries: [{ score: 10, timestamp: 1 }] };
      await post({ burndown, activePresetName: '大会' });
      await post({ fontFamily: 'Splatfont' });

      // メモリの状態（エフェクト・revision）だけを初期化しても、設定は残る
      __TEST_ONLY_setStreamData({ ...(await (await GET()).json()), lastEvent: null, revision: 0 });
      const body = await (await GET()).json();
      expect(body).toMatchObject({ burndown, activePresetName: '大会', fontFamily: 'Splatfont', fontSize: getInitialStreamData().fontSize });
    });

    it('rejects invalid values without saving anything', async () => {
      const responses = await Promise.all([
        post({ fontSize: 0 }),
        post({ fontSize: '60' }),
        post({ transitionEffect: 'spin' }),
        post({ transitionDuration: -1 }),
        post({ fontFamily: 'x'.repeat(201) }),
        post({ burndown: { label: 'あと', targetValue: 100, entries: [{ score: 'a', timestamp: 1 }] } }),
        post({ messagePresets: [{ name: '通常', messages: [{ id: 1 }] }] }),
        post({ fontSize: 60, transitionEffect: 'spin' }),
      ]);
      expect(responses.map((r) => r.status)).toEqual(Array(8).fill(400));

      const body = await (await GET()).json();
      expect(body).toEqual(getInitialStreamData());
    });

    it('rejects unknown fields, the score and the effect', async () => {
      // スコア表示は /api/score-display、エフェクトは PATCH で送る
      expect((await post({ scoreValue: '改ざん' })).status).toBe(400);
      expect((await post({ lastEvent: { name: 'STAR', timestamp: 1 } })).status).toBe(400);
      expect((await post({})).status).toBe(400);
      expect((await post([])).status).toBe(400);
      expect((await (await GET()).json()).scoreValue).toBe(getInitialStreamData().scoreValue);
    });

    it('rejects requests that are not JSON', async () => {
      expect((await post('{"fontSize":60}', 'text/plain')).status).toBe(415);
      expect((await post('not json')).status).toBe(400);
    });
  });

  describe('PATCH', () => {
    const patch = (body: unknown, contentType = 'application/json') =>
      PATCH(new NextRequest('http://localhost/api/stream-data', {
        method: 'PATCH',
        headers: { 'Content-Type': contentType },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      }));

    it('sets only lastEvent and bumps the revision', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
      const response = await patch({ event: 'STAR' });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({
        ...getInitialStreamData(),
        lastEvent: { name: 'STAR', timestamp: 1_700_000_000_000 },
        revision: 1,
      });
      vi.restoreAllMocks();
    });

    it('accepts the fireworks of the burndown overlay', async () => {
      const body = await (await patch({ event: 'FIREWORKS' })).json();
      expect(body.lastEvent.name).toBe('FIREWORKS');
    });

    it('rejects an unknown event', async () => {
      expect((await patch({ event: 'BOMB' })).status).toBe(400);
      expect((await patch({})).status).toBe(400);
      expect((await (await GET()).json()).lastEvent).toBeNull();
    });

    it('rejects non-JSON requests', async () => {
      expect((await patch('{"event":"STAR"}', 'text/plain')).status).toBe(415);
      expect((await patch('not json')).status).toBe(400);
    });
  });
});
