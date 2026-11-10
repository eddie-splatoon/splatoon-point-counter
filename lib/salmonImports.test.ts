// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';

import { __TEST_ONLY_setDb, openDb } from './db';
import { deleteJob, getSummary, startSession } from './salmon';
import {
  SalmonImportResult,
  getRecordedJobs,
  listImports,
  listPendingImports,
  parseImportResult,
  requestImport,
  updateImport,
} from './salmonImports';
import {
  MAX_IMPORT_JOBS,
  SALMON_IMPORT_EXPIRED_ERROR,
  SALMON_IMPORT_PROCESSING_TTL_MS,
  SALMON_IMPORT_REQUEST_TTL_MS,
  SALMON_IMPORT_TIMED_OUT_ERROR,
} from './salmonImportTypes';

const job = (goldenEggs = 85) => ({ goldenEggs, bossKills: 12, deaths: 2, cleared: true, waveReached: 3, stage: 'シェケナダム', weapons: [] });
const succeeded = (...playedAts: string[]): SalmonImportResult => ({
  status: 'succeeded',
  jobs: playedAts.map((playedAt, i) => ({ job: job(80 + i), playedAt, details: null })),
  captures: ['20261110-210600-detail.png'],
});

/** 依頼して取り込み中にする */
const startImport = (now = 1000) => {
  const { id } = requestImport(now);
  updateImport(id, { status: 'processing' }, now);
  return id;
};

beforeEach(() => {
  __TEST_ONLY_setDb(openDb(':memory:'));
});

describe('salmon result imports', () => {
  it('requests an import and returns the active one instead of creating another', () => {
    const first = requestImport(1000);
    expect(first).toMatchObject({ status: 'pending', requestedAt: 1000, jobId: null, recordedCount: 0, captures: [] });
    expect(listPendingImports(1000)).toEqual([first]);
    expect(requestImport(2000)).toEqual(first);

    updateImport(first.id, { status: 'processing' }, 2000);
    expect(requestImport(3000).id).toBe(first.id);
    expect(listPendingImports(3000)).toEqual([]);
  });

  it('expires requests that were not picked up and imports that stopped while processing', () => {
    const first = requestImport(1000);
    const later = 1000 + SALMON_IMPORT_REQUEST_TTL_MS + 1;
    expect(listImports(20, later)[0]).toMatchObject({ id: first.id, status: 'failed', error: SALMON_IMPORT_EXPIRED_ERROR });
    expect(updateImport(first.id, { status: 'processing' }, later)).toBe('notFound');

    const second = startImport(later);
    const stopped = later + SALMON_IMPORT_PROCESSING_TTL_MS + 1;
    expect(listImports(20, stopped)[0]).toMatchObject({ id: second, status: 'failed', error: SALMON_IMPORT_TIMED_OUT_ERROR });
  });

  it('records the job when the import succeeds', () => {
    const { id } = requestImport(1000);
    expect(updateImport(id, succeeded('2026/11/10 21:05'), 1500)).toBe('notFound'); // 開始前は結果を書き込めない
    updateImport(id, { status: 'processing' }, 1500);
    const result = updateImport(id, succeeded('2026/11/10 21:05'), 2000);
    const summary = getSummary();
    expect(summary.jobs).toHaveLength(1);
    expect(summary.lastJob).toMatchObject(job(80));
    expect(result).toMatchObject({
      status: 'succeeded', jobId: summary.lastJob!.id, playedAt: '2026/11/10 21:05', recordedCount: 1, captures: ['20261110-210600-detail.png'], completedAt: 2000,
    });

    // 結果は 1 回だけ
    expect(updateImport(id, succeeded('2026/11/10 21:15'), 3000)).toBe('notFound');
  });

  it('records missed jobs oldest first and skips the ones already recorded', () => {
    updateImport(startImport(), succeeded('2026/11/10 20:50'), 1000);

    const id = startImport(2000);
    const result = updateImport(id, succeeded('2026/11/10 20:50', '2026/11/10 20:58', '2026/11/10 21:05'), 2000);
    expect(result).toMatchObject({ status: 'succeeded', playedAt: '2026/11/10 21:05', recordedCount: 2 });
    // 「前回」が最新のバイトになるよう、古い順に記録する
    expect(getSummary().jobs.map((j) => j.goldenEggs)).toEqual([82, 81, 80]);
    expect(getRecordedJobs().playedAt).toEqual(['2026/11/10 21:05', '2026/11/10 20:58', '2026/11/10 20:50']);
  });

  it('does not record the same job twice unless the earlier record was deleted', () => {
    updateImport(startImport(), succeeded('2026/11/10 21:05'), 1000);

    const second = startImport(2000);
    expect(updateImport(second, succeeded('2026/11/10 21:05'), 2000)).toBe('duplicate');
    expect(listImports(20, 2000)[0]).toMatchObject({ id: second, status: 'processing' });
    expect(getSummary().jobs).toHaveLength(1);

    // 読み間違いで記録を消したら、同じバイトを取り込み直せる
    deleteJob(getSummary().lastJob!.id);
    expect(updateImport(second, succeeded('2026/11/10 21:05'), 2500)).toMatchObject({ status: 'succeeded' });
    expect(getSummary().jobs).toHaveLength(1);
  });

  it('records failures with the captures', () => {
    const id = startImport();
    expect(updateImport(id, { status: 'failed', error: 'ミラーリングが見つかりません', captures: ['a.png'] }, 2000))
      .toMatchObject({ status: 'failed', error: 'ミラーリングが見つかりません', captures: ['a.png'], completedAt: 2000 });
    expect(getSummary().jobs).toHaveLength(0);
  });

  it('returns the start of the current session for the script', () => {
    expect(getRecordedJobs()).toEqual({ playedAt: [], sessionStartedAt: null });
    startSession('', 5000);
    expect(getRecordedJobs().sessionStartedAt).toBe(5000);
  });
});

describe('parseImportResult', () => {
  it('accepts valid bodies', () => {
    expect(parseImportResult({ id: 1, status: 'processing' })).toEqual({ id: 1, result: { status: 'processing' } });
    expect(parseImportResult({ id: 1, status: 'succeeded', jobs: [{ job: job(80), playedAt: ' 2026/11/10 21:05 ' }], captures: ['20261110-210600-detail.png'] }))
      .toEqual({ id: 1, result: succeeded('2026/11/10 21:05') });
    expect(parseImportResult({ id: 1, status: 'failed', error: ' x ' })).toEqual({ id: 1, result: { status: 'failed', error: 'x', captures: [] } });
  });

  it('rejects invalid bodies', () => {
    const valid = { job: job(), playedAt: '2026/11/10 21:05' };
    expect(parseImportResult({ id: 0, status: 'processing' })).toMatch(/id/);
    expect(parseImportResult({ id: 1, status: 'done' })).toMatch(/status/);
    expect(parseImportResult({ id: 1, status: 'succeeded', jobs: [] })).toMatch(/jobs/);
    expect(parseImportResult({ id: 1, status: 'succeeded', jobs: Array(MAX_IMPORT_JOBS + 1).fill(valid) })).toMatch(/jobs/);
    expect(parseImportResult({ id: 1, status: 'succeeded', jobs: [{ ...valid, job: { ...job(), goldenEggs: -1 } }] })).toMatch(/goldenEggs/);
    expect(parseImportResult({ id: 1, status: 'succeeded', jobs: [{ ...valid, playedAt: '' }] })).toMatch(/playedAt/);
    expect(parseImportResult({ id: 1, status: 'succeeded', jobs: [valid], captures: ['../overlay.db'] })).toMatch(/captures/);
    expect(parseImportResult({ id: 1, status: 'succeeded', jobs: [valid], captures: ['x.jpg'] })).toMatch(/captures/);
    expect(parseImportResult({ id: 1, status: 'failed', error: ' ' })).toMatch(/error/);
  });

  it('keeps the job and drops only the details when the details are invalid', () => {
    const valid = { job: job(), playedAt: '2026/11/10 21:05' };
    for (const details of [
      { hazardLevel: -1 },
      { bosses: [{ boss: 'unknown', appearances: 1, teamKills: 1, selfKills: 0 }] },
      { bosses: [{ boss: 'hebi', appearances: 2, teamKills: 3, selfKills: 0 }] },
    ]) {
      expect(parseImportResult({ id: 1, status: 'succeeded', jobs: [{ ...valid, details }] }))
        .toMatchObject({ result: { jobs: [{ job: valid.job, details: null }] } });
    }
  });

  it('accepts jobs with details', () => {
    const parsed = parseImportResult({
      id: 1, status: 'succeeded',
      jobs: [{ job: job(), playedAt: '2026/11/10 21:05', details: { hazardLevel: 333, bosses: [{ boss: 'hebi', appearances: 5, teamKills: 5, selfKills: 2 }] } }],
    });
    expect(parsed).toMatchObject({ result: { jobs: [{ details: { hazardLevel: 333, bosses: [{ boss: 'hebi', selfKills: 2 }] } }] } });
  });
});

describe('importing details', () => {
  it('records the details with the job and ranks the bosses', () => {
    const id = startImport();
    const details = parseImportResult({
      id, status: 'succeeded',
      jobs: [{ job: job(), playedAt: '2026/11/10 21:05', details: { bosses: [{ boss: 'tower', appearances: 6, teamKills: 6, selfKills: 3 }] } }],
    });
    if (typeof details === 'string') throw new Error(details);
    updateImport(id, details.result, 2000);
    expect(getSummary().bossRanking.lastJob).toEqual([{ boss: 'tower', appearances: 6, teamKills: 6, selfKills: 3 }]);
  });
});
