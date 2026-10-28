// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { __TEST_ONLY_setDb, getAppState, openDb, setAppState } from './db';

describe('app_state', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'overlay-db-'));
    __TEST_ONLY_setDb(openDb(':memory:'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('returns null for a key that has not been saved', () => {
    expect(getAppState('missing')).toBeNull();
  });

  it('saves and overwrites a JSON value', () => {
    setAppState('key', { a: 1 });
    setAppState('key', { a: 2, list: ['x'] });
    expect(getAppState('key')).toEqual({ a: 2, list: ['x'] });
  });

  it('keeps values after reopening the database file', () => {
    const path = join(dir, 'data', 'overlay.db');
    const first = openDb(path);
    __TEST_ONLY_setDb(first);
    setAppState('key', { saved: true });
    first.close();

    __TEST_ONLY_setDb(openDb(path));
    expect(getAppState('key')).toEqual({ saved: true });
  });
});
