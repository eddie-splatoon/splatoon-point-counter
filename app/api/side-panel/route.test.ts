// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it } from 'vitest';

import { __TEST_ONLY_setDb, openDb, setAppState } from '../../../lib/db';
import { getDefaultSidePanelSettings } from '../../../lib/sidePanelTypes';

import { GET, POST } from './route';

const post = (body: unknown, contentType = 'application/json') =>
  POST(new NextRequest('http://localhost/api/side-panel', {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }));

const settings = { activeSlot: 'burndown', autoRotate: true, rotateSeconds: 15, enabledSlots: ['salmon', 'burndown'] };

beforeEach(() => {
  __TEST_ONLY_setDb(openDb(':memory:'));
});

describe('Side panel API', () => {
  it('returns the default settings before anything is saved', async () => {
    expect(await (await GET()).json()).toEqual(getDefaultSidePanelSettings());
  });

  it('saves settings and returns them on GET', async () => {
    const response = await post(settings);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(settings);
    expect(await (await GET()).json()).toEqual(settings);
  });

  it('falls back to the defaults when the saved settings are no longer valid', async () => {
    setAppState('sidePanel', { ...settings, activeSlot: 'removed-slot' });
    expect(await (await GET()).json()).toEqual(getDefaultSidePanelSettings());
  });

  it('returns 400 for invalid settings without saving them', async () => {
    const response = await post({ ...settings, rotateSeconds: 1 });
    expect(response.status).toBe(400);
    expect(await (await GET()).json()).toEqual(getDefaultSidePanelSettings());
  });

  it('returns 400 for invalid JSON', async () => {
    expect((await post('{invalid')).status).toBe(400);
  });

  it('returns 415 when Content-Type is not JSON', async () => {
    expect((await post(JSON.stringify(settings), 'text/plain')).status).toBe(415);
    expect(await (await GET()).json()).toEqual(getDefaultSidePanelSettings());
  });
});
