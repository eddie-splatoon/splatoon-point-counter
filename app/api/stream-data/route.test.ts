import { NextRequest } from 'next/server';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { __TEST_ONLY_setDb, openDb } from '../../../lib/db';
import { updateScoreDisplay } from '../../../lib/scoreDisplay';

import { GET, PATCH, POST, StreamData, getInitialStreamData, __TEST_ONLY_setStreamData } from './route';

// Reset the stream data before each test
beforeEach(() => {
  __TEST_ONLY_setDb(openDb(':memory:'));
  __TEST_ONLY_setStreamData(getInitialStreamData());
});

describe('Stream Data API', () => {
  describe('GET', () => {
    it('should return the current stream data', async () => {
      const response = await GET();
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual(getInitialStreamData());
    });
  });

  describe('POST', () => {
    it('should update the stream data with a valid request body', async () => {
      const initialData = getInitialStreamData();
      const newData = {
        ...initialData,
        scoreLabel: 'New Score Label',
        scoreValue: '1000',
        burndown: {
          ...initialData.burndown,
          entries: [{ score: 100, timestamp: 12345 }, { score: 200, timestamp: 67890 }],
        },
      };

      const request = new NextRequest('http://localhost/api/stream-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newData),
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.scoreLabel).toBe('New Score Label');
      expect(body.scoreValue).toBe('1000');
      expect(body.burndown.entries).toEqual([{ score: 100, timestamp: 12345 }, { score: 200, timestamp: 67890 }]);

      // Verify that the data was actually updated in the module
      const getResponse = await GET();
      const getBody = await getResponse.json();
      expect(getBody.scoreLabel).toBe('New Score Label');
    });

    it('should return a 400 error for an invalid request body', async () => {
      const invalidData = {
        scoreLabel: 123, // Invalid type
      };

      const request = new NextRequest('http://localhost/api/stream-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidData),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
    });

    it('keeps the score display when the payload has no score', async () => {
      updateScoreDisplay({ scoreLabel: 'ハイスコア', scoreValue: '264' });
      const withoutScore: Partial<StreamData> = { ...getInitialStreamData(), fontSize: 60 };
      delete withoutScore.scoreLabel;
      delete withoutScore.scoreValue;
      const response = await POST(new NextRequest('http://localhost/api/stream-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(withoutScore),
      }));
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toMatchObject({ scoreLabel: 'ハイスコア', scoreValue: '264', fontSize: 60 });
      expect(await (await GET()).json()).toMatchObject({ scoreValue: '264' });
    });

    it('rejects requests that are not JSON', async () => {
      const response = await POST(new NextRequest('http://localhost/api/stream-data', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ ...getInitialStreamData(), scoreValue: '改ざん' }),
      }));
      expect(response.status).toBe(415);
      expect((await (await GET()).json()).scoreValue).toBe(getInitialStreamData().scoreValue);
    });

    it('should update lastEvent when it is in the payload', async () => {
        const initialData = getInitialStreamData();
        const event = { name: 'STAR', timestamp: Date.now() };
        const payload = {
            ...initialData,
            lastEvent: event,
        };

        const request = new NextRequest('http://localhost/api/stream-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const response = await POST(request);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.lastEvent).toEqual(event);
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
