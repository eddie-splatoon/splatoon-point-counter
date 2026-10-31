// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

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

describe('migration', () => {
  it('adds the weapons column to a database created before it existed', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'overlay-db-'));
    try {
      const path = join(dir, 'overlay.db');
      const old = new DatabaseSync(path);
      old.exec(`
        CREATE TABLE salmon_sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, started_at INTEGER NOT NULL, title TEXT NOT NULL DEFAULT '');
        CREATE TABLE salmon_jobs (
          id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER NOT NULL, created_at INTEGER NOT NULL,
          golden_eggs INTEGER NOT NULL, boss_kills INTEGER NOT NULL, deaths INTEGER NOT NULL,
          cleared INTEGER NOT NULL, wave_reached INTEGER NOT NULL, stage TEXT NOT NULL DEFAULT '');
        INSERT INTO salmon_sessions (started_at) VALUES (1);
        INSERT INTO salmon_jobs (session_id, created_at, golden_eggs, boss_kills, deaths, cleared, wave_reached) VALUES (1, 1, 30, 10, 0, 1, 3);
      `);
      old.close();

      const db = openDb(path);
      expect(db.prepare('SELECT weapons FROM salmon_jobs').get()).toEqual({ weapons: '[]' });
      db.close();
      // 2回目以降に開いても列を足し直さない
      openDb(path).close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
