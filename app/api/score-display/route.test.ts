// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it } from 'vitest';

import { __TEST_ONLY_setDb, openDb } from '../../../lib/db';
import { DEFAULT_SCORE_DISPLAY } from '../../../lib/scoreDisplayTypes';

import { GET, PATCH } from './route';

const patch = (body: unknown, contentType = 'application/json') =>
  PATCH(new NextRequest('http://localhost/api/score-display', {
    method: 'PATCH',
    headers: { 'Content-Type': contentType },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }));

beforeEach(() => {
  __TEST_ONLY_setDb(openDb(':memory:'));
});

describe('Score display API', () => {
  it('returns the defaults before anything is saved', async () => {
    expect(await (await GET()).json()).toEqual(DEFAULT_SCORE_DISPLAY);
  });

  it('updates only the sent items', async () => {
    expect(await (await patch({ scoreLabel: 'ハイスコア', scoreValue: '264' })).json())
      .toEqual({ scoreLabel: 'ハイスコア', scoreValue: '264', autoUpdate: true });
    expect(await (await patch({ autoUpdate: false })).json()).toEqual({ scoreLabel: 'ハイスコア', scoreValue: '264', autoUpdate: false });
    expect(await (await GET()).json()).toMatchObject({ scoreValue: '264', autoUpdate: false });
  });

  it('rejects requests that are not JSON and invalid values', async () => {
    expect((await patch('{}', 'text/plain')).status).toBe(415);
    expect((await patch('{')).status).toBe(400);
    expect((await patch({ scoreValue: 264 })).status).toBe(400);
  });
});
