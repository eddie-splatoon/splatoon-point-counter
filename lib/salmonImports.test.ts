// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';

import { __TEST_ONLY_setDb, openDb } from './db';
import { deleteJob, getSummary } from './salmon';
import { SalmonImportResult, listImports, listPendingImports, parseImportResult, requestImport, updateImport } from './salmonImports';
import {
  SALMON_IMPORT_EXPIRED_ERROR,
  SALMON_IMPORT_PROCESSING_TTL_MS,
  SALMON_IMPORT_REQUEST_TTL_MS,
  SALMON_IMPORT_TIMED_OUT_ERROR,
} from './salmonImportTypes';

const job = { goldenEggs: 85, bossKills: 12, deaths: 2, cleared: true, waveReached: 3, stage: 'シェケナダム', weapons: [] };
const succeeded = (playedAt = '2026/11/10 21:05'): SalmonImportResult =>
  ({ status: 'succeeded', job, playedAt, captures: ['20261110-210600-1.png'] });

beforeEach(() => {
  __TEST_ONLY_setDb(openDb(':memory:'));
});

describe('salmon result imports', () => {
  it('requests an import and returns the active one instead of creating another', () => {
    const first = requestImport(1000);
    expect(first).toMatchObject({ status: 'pending', requestedAt: 1000, jobId: null, captures: [] });
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

    const second = requestImport(later);
    updateImport(second.id, { status: 'processing' }, later);
    const stopped = later + SALMON_IMPORT_PROCESSING_TTL_MS + 1;
    expect(listImports(20, stopped)[0]).toMatchObject({ id: second.id, status: 'failed', error: SALMON_IMPORT_TIMED_OUT_ERROR });
  });

  it('records the job when the import succeeds', () => {
    const { id } = requestImport(1000);
    expect(updateImport(id, succeeded(), 1500)).toBe('notFound'); // 開始前は結果を書き込めない
    updateImport(id, { status: 'processing' }, 1500);
    const result = updateImport(id, succeeded(), 2000);
    const summary = getSummary();
    expect(summary.jobs).toHaveLength(1);
    expect(summary.lastJob).toMatchObject(job);
    expect(result).toMatchObject({ status: 'succeeded', jobId: summary.lastJob!.id, playedAt: '2026/11/10 21:05', captures: ['20261110-210600-1.png'], completedAt: 2000 });

    // 結果は 1 回だけ
    expect(updateImport(id, succeeded('2026/11/10 21:15'), 3000)).toBe('notFound');
  });

  it('does not record the same job twice unless the earlier record was deleted', () => {
    const first = requestImport(1000);
    updateImport(first.id, { status: 'processing' }, 1000);
    updateImport(first.id, succeeded(), 1000);

    const second = requestImport(2000);
    updateImport(second.id, { status: 'processing' }, 2000);
    expect(updateImport(second.id, succeeded(), 2000)).toBe('duplicate');
    expect(listImports(20, 2000)[0]).toMatchObject({ id: second.id, status: 'processing' });
    expect(getSummary().jobs).toHaveLength(1);

    // 読み間違いで記録を消したら、同じバイトを取り込み直せる
    deleteJob(getSummary().lastJob!.id);
    expect(updateImport(second.id, succeeded(), 2500)).toMatchObject({ status: 'succeeded' });
    expect(getSummary().jobs).toHaveLength(1);
  });

  it('records failures with the captures', () => {
    const { id } = requestImport(1000);
    updateImport(id, { status: 'processing' }, 1000);
    expect(updateImport(id, { status: 'failed', error: 'ミラーリングが見つかりません', captures: ['a.png'] }, 2000))
      .toMatchObject({ status: 'failed', error: 'ミラーリングが見つかりません', captures: ['a.png'], completedAt: 2000 });
    expect(getSummary().jobs).toHaveLength(0);
  });
});

describe('parseImportResult', () => {
  it('accepts valid bodies', () => {
    expect(parseImportResult({ id: 1, status: 'processing' })).toEqual({ id: 1, result: { status: 'processing' } });
    expect(parseImportResult({ id: 1, ...succeeded(' 2026/11/10 21:05 ') })).toEqual({ id: 1, result: succeeded() });
    expect(parseImportResult({ id: 1, status: 'failed', error: ' x ' })).toEqual({ id: 1, result: { status: 'failed', error: 'x', captures: [] } });
  });

  it('rejects invalid bodies', () => {
    expect(parseImportResult({ id: 0, status: 'processing' })).toMatch(/id/);
    expect(parseImportResult({ id: 1, status: 'done' })).toMatch(/status/);
    expect(parseImportResult({ id: 1, ...succeeded(), job: { ...job, goldenEggs: -1 } })).toMatch(/goldenEggs/);
    expect(parseImportResult({ id: 1, ...succeeded(''), })).toMatch(/playedAt/);
    expect(parseImportResult({ id: 1, ...succeeded(), captures: ['../overlay.db'] })).toMatch(/captures/);
    expect(parseImportResult({ id: 1, ...succeeded(), captures: ['x.jpg'] })).toMatch(/captures/);
    expect(parseImportResult({ id: 1, status: 'failed', error: ' ' })).toMatch(/error/);
  });
});
