import { NextRequest } from 'next/server';
import { describe, it, expect, beforeEach } from 'vitest';

import { GET, POST, getInitialTwitchData, __TEST_ONLY_setTwitchData } from './route';

const post = (body: unknown, contentType = 'application/json') =>
  POST(new NextRequest('http://localhost/api/twitch', {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }));

const validBody = { followerTotal: 10, goal: { current: 10, target: 20 }, lastFollowAt: 1700000000000 };

beforeEach(() => {
  __TEST_ONLY_setTwitchData(getInitialTwitchData());
});

describe('Twitch API', () => {
  describe('GET', () => {
    it('returns empty data before the script sends anything', async () => {
      const response = await GET();
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ followerTotal: null, goal: null, lastFollowAt: null, updatedAt: null, revision: 0 });
    });
  });

  describe('POST', () => {
    it('stores the state and increments the revision', async () => {
      const response = await post(validBody);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toMatchObject({ ...validBody, revision: 1 });
      expect(typeof body.updatedAt).toBe('number');
      expect(await (await GET()).json()).toEqual(body);
    });

    it('accepts a null goal and a null lastFollowAt', async () => {
      const response = await post({ followerTotal: 0, goal: null, lastFollowAt: null });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ followerTotal: 0, goal: null, lastFollowAt: null });
    });

    it('drops unknown fields such as follower names', async () => {
      const body = await (await post({ ...validBody, goal: { ...validBody.goal, extra: 'x' }, userName: 'someone' })).json();
      expect(body).not.toHaveProperty('userName');
      expect(body.goal).toEqual({ current: 10, target: 20 });
    });

    it.each([
      ['null body', null],
      ['missing followerTotal', { goal: null, lastFollowAt: null }],
      ['negative followerTotal', { ...validBody, followerTotal: -1 }],
      ['fractional followerTotal', { ...validBody, followerTotal: 1.5 }],
      ['string followerTotal', { ...validBody, followerTotal: '10' }],
      ['missing goal', { followerTotal: 10, lastFollowAt: null }],
      ['goal with zero target', { ...validBody, goal: { current: 0, target: 0 } }],
      ['goal with string current', { ...validBody, goal: { current: '1', target: 20 } }],
      ['missing lastFollowAt', { followerTotal: 10, goal: null }],
      ['string lastFollowAt', { ...validBody, lastFollowAt: 'now' }],
    ])('returns 400 for %s', async (_, body) => {
      const response = await post(body);
      expect(response.status).toBe(400);
      expect((await (await GET()).json()).revision).toBe(0);
    });

    it('returns 400 for invalid JSON', async () => {
      expect((await post('{invalid')).status).toBe(400);
    });

    it('returns 415 when Content-Type is not JSON', async () => {
      const response = await post(JSON.stringify(validBody), 'text/plain');
      expect(response.status).toBe(415);
      expect((await (await GET()).json()).revision).toBe(0);
    });
  });
});
