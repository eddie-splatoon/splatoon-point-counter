// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';

import { completeClip, requestClip } from './clips';
import { __TEST_ONLY_setDb, setAppState, openDb } from './db';
import { addJob, parseJobDetails, startSession } from './salmon';
import { getSessionReview } from './salmonReview';
import { SalmonJobDetails } from './salmonTypes';
import { getDefaultSidePanelSettings } from './sidePanelTypes';
import { setManualWeapon } from './weaponCard';

const job = { goldenEggs: 30, bossKills: 12, deaths: 1, cleared: true, waveReached: 3, stage: 'アラマキ砦', weapons: ['sshooter'] };
const created = { status: 'created' as const, clipId: 'Clip-1', editUrl: 'https://www.twitch.tv/x/clip/Clip-1/edit' };

const details = (overrides: Record<string, unknown> = {}): SalmonJobDetails => {
  const parsed = parseJobDetails({
    hazardLevel: 300, gradeName: 'でんせつ', gradePoint: 400, jobPoint: 200,
    scaleBronze: 1, scaleSilver: 0, scaleGold: null, kingName: null, kingDefeated: null,
    waves: [{ wave: 1, delivered: 30, quota: 25 }],
    players: [
      { position: 0, name: 'じぶん', powerEggs: 700, rescues: 2, goldenAssists: 3, weapons: [] },
      { position: 1, name: 'みかた', powerEggs: 999, rescues: 9, goldenAssists: 9, weapons: [] },
    ],
    bosses: [
      { boss: 'tower', appearances: 6, teamKills: 6, selfKills: 4 },
      { boss: 'mogura', appearances: 3, teamKills: 2, selfKills: 0 },
    ],
    ...overrides,
  });
  if (typeof parsed === 'string') throw new Error(parsed);
  return parsed;
};

beforeEach(() => {
  __TEST_ONLY_setDb(openDb(':memory:'));
});

describe('getSessionReview', () => {
  it('returns an empty review before any session', () => {
    const review = getSessionReview();
    expect(review).toMatchObject({ session: null, jobs: [], detailedJobs: 0, bosses: [], teamHighScores: [], waveFailures: [0, 0, 0], challenges: null });
  });

  it('summarizes the jobs of the current session oldest first', () => {
    startSession('', 1000);
    const first = addJob(job, 1100, '2026/11/10 10:00', details());
    addJob({ ...job, goldenEggs: 12, cleared: false, waveReached: 2, weapons: ['sshooter', 'pablo'] }, 1200, '2026/11/10 10:10',
      details({ hazardLevel: 333, gradePoint: 420, jobPoint: 50, kingName: 'タツ', kingDefeated: false,
        bosses: [{ boss: 'tower', appearances: 3, teamKills: 3, selfKills: 1 }, { boss: 'hebi', appearances: 2, teamKills: 2, selfKills: 2 }] }));
    // 手入力のバイト（詳細なし）は合計にだけ入る
    addJob({ ...job, goldenEggs: 20, cleared: false, waveReached: 1 }, 1300);

    const review = getSessionReview();
    expect(review?.totals).toMatchObject({ jobs: 3, goldenEggs: 62, clears: 1, failures: 2 });
    expect(review?.jobs.map((j) => [j.goldenEggs, j.hazardLevel])).toEqual([[30, 300], [12, 333], [20, null]]);
    expect(review).toMatchObject({
      detailedJobs: 2,
      powerEggs: 1400, // 自分（position 0）だけ
      rescues: 4,
      goldenAssists: 6,
      jobPoints: 250,
      maxHazardLevel: 333,
      scales: { bronze: 2, silver: 0, gold: 0 },
      firstGrade: { name: 'でんせつ', point: 400 },
      lastGrade: { name: 'でんせつ', point: 420 },
      waveFailures: [1, 1, 0],
      kings: { appeared: 1, defeated: 0 },
      bestJobId: first.id,
      weapons: [{ key: 'sshooter', count: 3 }, { key: 'pablo', count: 1 }],
    });
    // 出現したオオモノすべて（討伐 0 体も含める）。自分の討伐数の多い順、同数はオオモノの表示順
    expect(review?.bosses).toEqual([
      { boss: 'tower', selfKills: 5, teamKills: 9, appearances: 9 },
      { boss: 'hebi', selfKills: 2, teamKills: 2, appearances: 2 },
      { boss: 'mogura', selfKills: 0, teamKills: 2, appearances: 3 },
    ]);
  });

  it('ranks the team golden eggs of the imported jobs, the earlier job first on a tie', () => {
    startSession('', 1000);
    const scores = [110, 95, 128, 110, 70, 100];
    scores.forEach((teamGoldenEggs, i) => addJob(job, 1100 + i, `2026/11/10 10:0${i}`, details({ teamGoldenEggs })));
    // 詳細の無いバイト・チームの納品数が読めなかったバイトは数えない
    addJob(job, 1200);
    addJob(job, 1300, '2026/11/10 11:00', details({ teamGoldenEggs: null }));

    expect(getSessionReview()?.teamHighScores.map((s) => [s.teamGoldenEggs, s.jobNumber])).toEqual([[128, 3], [110, 1], [110, 4], [100, 6], [95, 2]]);
  });

  it('does not return the names of the teammates', () => {
    startSession('', 1000);
    addJob(job, 1100, '2026/11/10 10:00', details());
    expect(JSON.stringify(getSessionReview())).not.toMatch(/みかた|じぶん/);
  });

  it('counts the weapons filled and the clips made only during the session', () => {
    const past = startSession('', 1000);
    addJob(job, 1100);
    setManualWeapon('hokusai', true, 1500);
    completeClip(requestClip('voice', 1200).id, created, 1300);
    startSession('', 5000);
    addJob({ ...job, weapons: ['pablo', 'sshooter'] }, 5100);
    completeClip(requestClip('voice', 5200).id, created, 5300);
    // 失敗したクリップは数えない
    completeClip(requestClip('voice', 5400).id, { status: 'failed', error: 'x' }, 5500);

    expect(getSessionReview()).toMatchObject({ newWeapons: ['pablo'], clips: 1 });
    expect(getSessionReview(past.id)).toMatchObject({ newWeapons: ['sshooter', 'hokusai'], clips: 1 });
  });

  it('shows the challenges only for the current session', () => {
    const past = startSession('', 1000);
    startSession('', 2000);
    setAppState('sidePanel', {
      ...getDefaultSidePanelSettings(),
      challenges: [{ id: 1, text: 'クリア', done: true }, { id: 2, text: '金イクラ 30', done: false }],
    });
    expect(getSessionReview()?.challenges).toEqual({ done: 1, total: 2 });
    expect(getSessionReview(past.id)?.challenges).toBeNull();
  });

  it('returns null for an unknown session', () => {
    expect(getSessionReview(99)).toBeNull();
  });
});
