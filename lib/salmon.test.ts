// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';

import { __TEST_ONLY_setDb, getDb, openDb } from './db';
import { addJob, deleteJob, getSummary, listSessions, parseId, parseJob, parseJobDetails, startSession } from './salmon';
import { MAX_COUNT, MAX_STAGE_LENGTH, SalmonJobDetails } from './salmonTypes';

const job = { goldenEggs: 30, bossKills: 12, deaths: 1, cleared: true, waveReached: 3, stage: 'アラマキ砦', weapons: ['sshooter', 'kuma_blaster'], jobKind: null };

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
      bossRanking: { lastJob: [], session: [] },
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

  it('ignores broken or unknown stored weapons', () => {
    const recorded = addJob(job, 1000);
    getDb().prepare('UPDATE salmon_jobs SET weapons = ? WHERE id = ?').run('not json', recorded.id);
    expect(getSummary().lastJob?.weapons).toEqual([]);
    getDb().prepare('UPDATE salmon_jobs SET weapons = ? WHERE id = ?').run('["sshooter","removed_weapon"]', recorded.id);
    expect(getSummary().lastJob?.weapons).toEqual(['sshooter']);
  });

  it('returns an empty summary for an unknown session', () => {
    expect(getSummary(999).session).toBeNull();
  });
});

describe('parseJob', () => {
  const body = { goldenEggs: 30, bossKills: 12, deaths: 1, cleared: false, waveReached: 2, stage: '  シェケナダム ' };

  it('accepts a failed job and trims the stage', () => {
    expect(parseJob(body)).toEqual({ ...body, stage: 'シェケナダム', weapons: [], jobKind: null });
  });

  it('defaults waveReached to the last wave when cleared', () => {
    expect(parseJob({ goldenEggs: 0, bossKills: 0, deaths: 0, cleared: true })).toEqual({
      goldenEggs: 0, bossKills: 0, deaths: 0, cleared: true, waveReached: 3, stage: '', weapons: [], jobKind: null,
    });
  });

  it('allows five waves and five weapons in a team contest', () => {
    const weapons = ['bold', 'bold', 'bold', 'bold', 'bold'];
    expect(parseJob({ goldenEggs: 0, bossKills: 0, deaths: 0, cleared: true, weapons, jobKind: 'teamContest' }))
      .toMatchObject({ waveReached: 5, weapons, jobKind: 'teamContest' });
    expect(parseJob({ ...body, waveReached: 4, jobKind: 'teamContest' })).toMatchObject({ waveReached: 4, cleared: false });
  });

  it('keeps three waves for a big run', () => {
    expect(parseJob({ ...body, cleared: true, waveReached: undefined, jobKind: 'bigRun' })).toMatchObject({ waveReached: 3, jobKind: 'bigRun' });
  });

  it('accepts up to four weapons including the same weapon twice', () => {
    const weapons = ['sshooter', 'sshooter', 'kuma_roller', 'pablo'];
    expect(parseJob({ ...body, weapons })).toMatchObject({ weapons });
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
    ['non-array weapons', { ...body, weapons: 'sshooter' }],
    ['an unknown weapon', { ...body, weapons: ['sshooter', 'splatscope'] }],
    ['six weapons', { ...body, weapons: ['bold', 'bold', 'bold', 'bold', 'bold', 'bold'] }],
    ['an unknown jobKind', { ...body, jobKind: 'privateJob' }],
    ['a team contest cleared before WAVE 5', { ...body, cleared: true, waveReached: 3, jobKind: 'teamContest' }],
    ['waveReached 6 in a team contest', { ...body, waveReached: 6, jobKind: 'teamContest' }],
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

const details = (overrides: Partial<SalmonJobDetails> = {}): SalmonJobDetails => {
  const parsed = parseJobDetails({
    hazardLevel: 333, gradeName: 'でんせつ', gradePoint: 999, jobPoint: 472, jobScore: 130, jobRate: 3.25, clearBonus: 50,
    teamGoldenEggs: 114, teamPowerEggs: 3281, scaleBronze: null, scaleSilver: null, scaleGold: null, kingName: null, kingDefeated: null,
    waves: [
      { wave: 1, delivered: 36, quota: 30, waterLevel: '普通', event: '-', goldenAppearances: 78, specialsUsed: 3 },
      { wave: 2, delivered: 42, quota: 32, waterLevel: '満潮', event: '霧', goldenAppearances: 90, specialsUsed: 1 },
    ],
    players: [
      { position: 0, name: 'じぶん', bossKills: 24, goldenEggs: 12, goldenAssists: 8, powerEggs: 684, rescues: 1, rescued: 2, weapons: ['sshooter'], special: 'nicedama' },
      { position: 1, name: 'みかた', bossKills: 24, goldenEggs: 60, goldenAssists: null, powerEggs: 1254, rescues: 3, rescued: 0, weapons: [], special: null },
    ],
    bosses: [
      { boss: 'hebi', appearances: 8, teamKills: 8, selfKills: 3 },
      { boss: 'bakudan', appearances: 10, teamKills: 9, selfKills: 3 },
      { boss: 'tower', appearances: 5, teamKills: 5, selfKills: 5 },
      { boss: 'mogura', appearances: 4, teamKills: 4, selfKills: 0 },
    ],
    ...overrides,
  });
  if (typeof parsed === 'string') throw new Error(parsed);
  return parsed;
};

describe('job details', () => {
  it('saves the details into the job and child tables', () => {
    const recorded = addJob(job, 1000, '2026/11/09 21:18', details());
    const db = getDb();
    expect(db.prepare('SELECT hazard_level, job_rate_x100, grade_name, king_defeated FROM salmon_jobs WHERE id = ?').get(recorded.id))
      .toEqual({ hazard_level: 333, job_rate_x100: 325, grade_name: 'でんせつ', king_defeated: null });
    expect(db.prepare('SELECT wave, water_level, event FROM salmon_job_waves WHERE job_id = ? ORDER BY wave').all(recorded.id))
      .toEqual([{ wave: 1, water_level: '普通', event: '' }, { wave: 2, water_level: '満潮', event: '霧' }]);
    expect(db.prepare('SELECT position, name, special FROM salmon_job_players WHERE job_id = ? ORDER BY position').all(recorded.id))
      .toEqual([{ position: 0, name: 'じぶん', special: 'nicedama' }, { position: 1, name: 'みかた', special: null }]);
  });

  it('ranks the bosses of the last job and the session by own kills', () => {
    addJob(job, 1000, '2026/11/09 21:10', details());
    addJob(job, 2000, '2026/11/09 21:18', details({ bosses: [{ boss: 'hebi', appearances: 4, teamKills: 4, selfKills: 4 }] }));

    const { bossRanking } = getSummary();
    expect(bossRanking.lastJob).toEqual([{ boss: 'hebi', appearances: 4, teamKills: 4, selfKills: 4 }]);
    // 0 体（モグラ）は除く
    expect(bossRanking.session.map((b) => [b.boss, b.selfKills])).toEqual([['hebi', 7], ['tower', 5], ['bakudan', 3]]);
    expect(bossRanking.session[0]).toMatchObject({ teamKills: 12, appearances: 12 });
  });

  it('orders bosses with the same kills in the display order', () => {
    addJob(job, 1000, '2026/11/09 21:10', details());
    // バクダンとヘビは 3 体ずつ。表示順でバクダンが先
    expect(getSummary().bossRanking.lastJob.map((b) => b.boss)).toEqual(['tower', 'bakudan', 'hebi']);
  });

  it('has an empty ranking for the last job when it has no details', () => {
    addJob(job, 1000, '2026/11/09 21:10', details());
    addJob(job, 2000);
    expect(getSummary().bossRanking.lastJob).toEqual([]);
    expect(getSummary().bossRanking.session).toHaveLength(3);
  });

  it('deletes the details with the job', () => {
    const recorded = addJob(job, 1000, '2026/11/09 21:10', details());
    deleteJob(recorded.id);
    expect(getDb().prepare('SELECT COUNT(*) AS n FROM salmon_job_bosses').get()).toEqual({ n: 0 });
    expect(getSummary().bossRanking).toEqual({ lastJob: [], session: [] });
  });

  it('does not expose the player names in the summary', () => {
    addJob(job, 1000, '2026/11/09 21:10', details());
    expect(JSON.stringify(getSummary())).not.toContain('みかた');
  });

  it('accepts details with unread items left out', () => {
    expect(parseJobDetails({})).toMatchObject({ hazardLevel: null, waves: [], players: [], bosses: [] });
  });

  it('normalizes names and drops control characters', () => {
    const parsed = parseJobDetails({ players: [{ position: 1, name: ' ＡＢ\u0007Ｃ ' }] });
    expect(parsed).toMatchObject({ players: [{ name: 'ABC' }] });
  });

  it.each([
    [[], /details/],
    [{ hazardLevel: 1000 }, /hazardLevel/],
    [{ jobRate: 'x' }, /jobRate/],
    [{ kingDefeated: 'yes' }, /kingDefeated/],
    [{ teamGoldenEggs: -1 }, /counts/],
    [{ waves: [{ wave: 7 }] }, /wave/],
    [{ waves: [{ wave: 1 }, { wave: 1 }] }, /duplicates/],
    [{ waves: [{ wave: 1, waterLevel: '大潮' }] }, /waterLevel/],
    [{ players: [{ position: 4 }] }, /position/],
    [{ players: [{ position: 0, weapons: ['unknown'] }] }, /weapons/],
    [{ players: [{ position: 0, special: 'unknown' }] }, /special/],
    [{ bosses: [{ boss: 'unknown', appearances: 1, teamKills: 1, selfKills: 1 }] }, /boss/],
    [{ bosses: [{ boss: 'hebi', appearances: 1, teamKills: 2, selfKills: 1 }] }, /selfKills <= teamKills <= appearances/],
  ])('rejects invalid details %j', (body, message) => {
    expect(parseJobDetails(body)).toMatch(message);
  });
});
