import { beforeEach, describe, expect, it, vi } from 'vitest';

import { __TEST_ONLY_setDb, openDb } from './db';
import { addJob } from './salmon';
import { SalmonScheduleData, SalmonScheduleEntry } from './salmonSchedule';
import { NewSalmonJob, SalmonJobDetails } from './salmonTypes';
import {
  computeScoreDisplay,
  getScoreDisplay,
  getShiftHighScore,
  parsePlayedAt,
  updateScoreDisplay,
  updateScoreDisplayFromImport,
} from './scoreDisplay';
import { DEFAULT_SCORE_DISPLAY } from './scoreDisplayTypes';

// 2026/6/20 9:00〜6/22 9:00（日本時間）のビッグラン
const BIG_RUN: SalmonScheduleEntry = {
  kind: 'bigRun', startTime: Date.parse('2026-06-20T00:00:00Z'), endTime: Date.parse('2026-06-22T00:00:00Z'),
  stage: { name: 'タラポートショッピングパーク', image: '' }, weapons: [],
};
const TEAM_CONTEST: SalmonScheduleEntry = { ...BIG_RUN, kind: 'teamContest', startTime: Date.parse('2026-08-29T00:00:00Z'), endTime: Date.parse('2026-08-31T00:00:00Z') };
const schedule: SalmonScheduleData = { entries: [BIG_RUN, TEAM_CONTEST], fetchedAt: 0 };

const job = (overrides: Partial<NewSalmonJob> = {}): NewSalmonJob => ({
  goldenEggs: 50, bossKills: 20, deaths: 1, cleared: true, waveReached: 3, stage: '', weapons: [], jobKind: 'bigRun', ...overrides,
});

const details = (overrides: Partial<SalmonJobDetails> = {}): SalmonJobDetails => ({
  hazardLevel: 333, gradeName: 'でんせつ', gradePoint: 999, jobPoint: null, jobScore: null, jobRate: null, clearBonus: null,
  teamGoldenEggs: 234, teamPowerEggs: null, scaleBronze: null, scaleSilver: null, scaleGold: null, kingName: null, kingDefeated: null,
  waves: [], players: [], bosses: [], ...overrides,
});

const record = (playedAt: string, jobOverrides: Partial<NewSalmonJob> = {}, detailOverrides: Partial<SalmonJobDetails> = {}) => {
  const recorded = { job: job(jobOverrides), playedAt, details: details(detailOverrides) };
  addJob(recorded.job, 1000, playedAt, recorded.details);
  return recorded;
};

beforeEach(() => {
  __TEST_ONLY_setDb(openDb(':memory:'));
});

describe('parsePlayedAt', () => {
  it('reads the date shown in the app as Japan time', () => {
    expect(parsePlayedAt('2026/6/21 15:47')).toBe(Date.parse('2026-06-21T06:47:00Z'));
    expect(parsePlayedAt('2026/11/09 09:05')).toBe(Date.parse('2026-11-09T00:05:00Z'));
  });

  it('returns null for an unexpected format', () => {
    expect(parsePlayedAt('6/21 15:47')).toBeNull();
  });
});

describe('getShiftHighScore', () => {
  it('returns the best team golden eggs in the shift, counting failed big run jobs', () => {
    record('2026/6/20 17:30', {}, { teamGoldenEggs: 185 });
    record('2026/6/20 23:19', { cleared: false, waveReached: 3 }, { teamGoldenEggs: 240 });
    record('2026/6/22 9:00', {}, { teamGoldenEggs: 300 }); // シフトの外（終わりちょうど）
    record('2026/6/21 12:00', { jobKind: 'regular' }, { teamGoldenEggs: 400 }); // 種類が違う
    expect(getShiftHighScore('bigRun', BIG_RUN)).toBe(240);
  });

  it('counts only cleared jobs in a team contest', () => {
    record('2026/8/29 12:36', { jobKind: 'teamContest', waveReached: 5 }, { teamGoldenEggs: 257 });
    record('2026/8/30 20:41', { jobKind: 'teamContest', cleared: false, waveReached: 4 }, { teamGoldenEggs: 280 });
    expect(getShiftHighScore('teamContest', TEAM_CONTEST)).toBe(257);
  });

  it('returns null when no job in the shift has the team golden eggs', () => {
    record('2026/6/20 17:30', {}, { teamGoldenEggs: null });
    expect(getShiftHighScore('bigRun', BIG_RUN)).toBeNull();
  });
});

describe('computeScoreDisplay', () => {
  it('shows the grade for a regular job', () => {
    expect(computeScoreDisplay({ jobKind: 'regular', playedAt: '2026/11/9 21:18', details: details({ gradePoint: 720 }) }, null))
      .toEqual({ scoreLabel: '現在のバイト評価', scoreValue: '720' });
  });

  it('shows the high score of the shift for a big run', () => {
    const latest = record('2026/6/21 15:47', {}, { teamGoldenEggs: 234 });
    record('2026/6/20 17:30', {}, { teamGoldenEggs: 185 });
    expect(computeScoreDisplay({ jobKind: 'bigRun', playedAt: latest.playedAt, details: latest.details }, schedule))
      .toEqual({ scoreLabel: 'ハイスコア', scoreValue: '234' });
  });

  it('returns null when the kind, grade or shift is unknown', () => {
    expect(computeScoreDisplay({ jobKind: null, playedAt: '2026/6/21 15:47', details: details() }, schedule)).toBeNull();
    expect(computeScoreDisplay({ jobKind: 'regular', playedAt: '2026/6/21 15:47', details: details({ gradeName: null }) }, null)).toBeNull();
    expect(computeScoreDisplay({ jobKind: 'regular', playedAt: '2026/6/21 15:47', details: null }, null)).toBeNull();
    const latest = record('2026/6/21 15:47');
    expect(computeScoreDisplay({ ...latest, jobKind: 'bigRun' }, null)).toBeNull();
    expect(computeScoreDisplay({ ...latest, jobKind: 'bigRun' }, { entries: [TEAM_CONTEST], fetchedAt: 0 })).toBeNull();
  });
});

describe('updateScoreDisplayFromImport', () => {
  it('updates the score with the latest job and keeps autoUpdate', async () => {
    const older = record('2026/6/20 17:30', {}, { teamGoldenEggs: 185 });
    const latest = record('2026/6/21 15:47', {}, { teamGoldenEggs: 234 });
    const loadSchedule = vi.fn(async () => schedule);
    expect(await updateScoreDisplayFromImport([older, latest], loadSchedule)).toEqual({ scoreLabel: 'ハイスコア', scoreValue: '234', autoUpdate: true });
    expect(getScoreDisplay()).toMatchObject({ scoreValue: '234' });
  });

  it('does not load the schedule for a regular job', async () => {
    const latest = record('2026/11/9 21:18', { jobKind: 'regular' }, { gradeName: 'たつじん+3', gradePoint: 450 });
    const loadSchedule = vi.fn(async () => schedule);
    await updateScoreDisplayFromImport([latest], loadSchedule);
    expect(loadSchedule).not.toHaveBeenCalled();
    expect(getScoreDisplay()).toMatchObject({ scoreLabel: '現在のバイト評価', scoreValue: 'たつじん+3 450' });
  });

  it('does nothing while autoUpdate is off or when the score cannot be decided', async () => {
    updateScoreDisplay({ autoUpdate: false, scoreValue: '手入力' });
    const latest = record('2026/11/9 21:18', { jobKind: 'regular' });
    expect(await updateScoreDisplayFromImport([latest])).toBeNull();
    expect(getScoreDisplay().scoreValue).toBe('手入力');

    updateScoreDisplay({ autoUpdate: true });
    const unknown = record('2026/11/9 21:30', { jobKind: null });
    expect(await updateScoreDisplayFromImport([unknown])).toBeNull();
    expect(getScoreDisplay().scoreValue).toBe('手入力');
  });
});

describe('updateScoreDisplay', () => {
  it('ignores undefined items', () => {
    expect(updateScoreDisplay({ scoreLabel: undefined, scoreValue: '999' })).toEqual({ ...DEFAULT_SCORE_DISPLAY, scoreValue: '999' });
  });
});
