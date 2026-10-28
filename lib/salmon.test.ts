// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';

import { __TEST_ONLY_setDb, openDb } from './db';
import { addJob, deleteJob, getSummary, listSessions, parseId, parseJob, startSession } from './salmon';
import { MAX_COUNT, MAX_STAGE_LENGTH } from './salmonTypes';

const job = { goldenEggs: 30, bossKills: 12, deaths: 1, cleared: true, waveReached: 3, stage: 'アラマキ砦' };

beforeEach(() => {
  __TEST_ONLY_setDb(openDb(':memory:'));
});

describe('salmon records', () => {
  it('returns an empty summary before anything is recorded', () => {
    expect(getSummary()).toEqual({
      session: null,
      lastJob: null,
      totals: { jobs: 0, goldenEggs: 0, bossKills: 0, deaths: 0, clears: 0, failures: 0 },
      jobs: [],
    });
  });

  it('creates a session automatically for the first job', () => {
    const recorded = addJob(job, 1000);

    const summary = getSummary();
    expect(summary.session).toEqual({ id: recorded.sessionId, startedAt: 1000, title: '' });
    expect(summary.lastJob).toEqual({ ...job, id: recorded.id, sessionId: recorded.sessionId, createdAt: 1000 });
  });

  it('totals the current session and returns jobs newest first', () => {
    addJob(job, 1000);
    addJob({ ...job, goldenEggs: 10, bossKills: 5, deaths: 3, cleared: false, waveReached: 2 }, 2000);

    const summary = getSummary();
    expect(summary.totals).toEqual({ jobs: 2, goldenEggs: 40, bossKills: 17, deaths: 4, clears: 1, failures: 1 });
    expect(summary.jobs.map((j) => j.createdAt)).toEqual([2000, 1000]);
    expect(summary.lastJob?.createdAt).toBe(2000);
  });

  it('records into the newest session and keeps past sessions', () => {
    addJob(job, 1000);
    const second = startSession('土曜の配信', 2000);
    addJob({ ...job, goldenEggs: 5 }, 3000);

    expect(getSummary().session).toEqual(second);
    expect(getSummary().totals.goldenEggs).toBe(5);

    const sessions = listSessions();
    expect(sessions.map((s) => s.title)).toEqual(['土曜の配信', '']);
    expect(sessions[1].totals.goldenEggs).toBe(30);
    expect(getSummary(sessions[1].id).totals.goldenEggs).toBe(30);
  });

  it('lists sessions without jobs with zero totals', () => {
    startSession('', 1000);
    expect(listSessions()[0].totals).toEqual({ jobs: 0, goldenEggs: 0, bossKills: 0, deaths: 0, clears: 0, failures: 0 });
  });

  it('deletes a job', () => {
    const first = addJob(job, 1000);
    addJob(job, 2000);

    expect(deleteJob(first.id)).toBe(true);
    expect(deleteJob(first.id)).toBe(false);
    expect(getSummary().totals.jobs).toBe(1);
  });

  it('returns an empty summary for an unknown session', () => {
    expect(getSummary(999).session).toBeNull();
  });
});

describe('parseJob', () => {
  const body = { goldenEggs: 30, bossKills: 12, deaths: 1, cleared: false, waveReached: 2, stage: '  シェケナダム ' };

  it('accepts a failed job and trims the stage', () => {
    expect(parseJob(body)).toEqual({ ...body, stage: 'シェケナダム' });
  });

  it('defaults waveReached to the last wave when cleared', () => {
    expect(parseJob({ goldenEggs: 0, bossKills: 0, deaths: 0, cleared: true })).toEqual({
      goldenEggs: 0, bossKills: 0, deaths: 0, cleared: true, waveReached: 3, stage: '',
    });
  });

  it('accepts the maximum count', () => {
    expect(parseJob({ ...body, goldenEggs: MAX_COUNT })).toMatchObject({ goldenEggs: MAX_COUNT });
  });

  it('truncates a long stage name', () => {
    const parsed = parseJob({ ...body, stage: 'あ'.repeat(MAX_STAGE_LENGTH + 10) });
    expect(typeof parsed !== 'string' && parsed.stage).toHaveLength(MAX_STAGE_LENGTH);
  });

  it.each([
    ['null body', null],
    ['missing goldenEggs', { ...body, goldenEggs: undefined }],
    ['negative bossKills', { ...body, bossKills: -1 }],
    ['fractional deaths', { ...body, deaths: 0.5 }],
    ['too many golden eggs', { ...body, goldenEggs: MAX_COUNT + 1 }],
    ['string goldenEggs', { ...body, goldenEggs: '30' }],
    ['missing cleared', { ...body, cleared: undefined }],
    ['missing waveReached on failure', { ...body, waveReached: undefined }],
    ['waveReached 0', { ...body, waveReached: 0 }],
    ['waveReached 4', { ...body, waveReached: 4 }],
    ['cleared before the last wave', { ...body, cleared: true, waveReached: 2 }],
    ['non-string stage', { ...body, stage: 1 }],
  ])('rejects %s', (_, input) => {
    expect(typeof parseJob(input)).toBe('string');
  });
});

describe('parseId', () => {
  it.each([
    ['1', 1],
    ['42', 42],
    [null, null],
    ['', null],
    ['0', null],
    ['-1', null],
    ['1.5', null],
    ['01', null],
    ['abc', null],
  ])('parses %s as %s', (input, expected) => {
    expect(parseId(input)).toBe(expected);
  });
});
