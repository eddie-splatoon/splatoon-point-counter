import { beforeEach, describe, expect, it } from 'vitest';

import { __TEST_ONLY_setDb, openDb } from './db';
import {
  HazardContext,
  __TEST_ONLY_resetJoinQueue,
  callNext,
  cancelJoin,
  closeQueue,
  getPanelView,
  getPublicView,
  getRecordedStreamerRating,
  joinQueue,
  openQueue,
  removeFromQueue,
  setStreamerRating,
} from './joinQueue';
import { JOIN_QUEUE_MAX_ENTRIES } from './joinQueueTypes';
import { addJob } from './salmon';
import { SalmonJobDetails } from './salmonTypes';

const join = (userId: string, args = '', userName = `Viewer${userId}`) =>
  joinQueue({ userId, userName, messageId: `m-${userId}`, args }, 1000);

beforeEach(() => {
  __TEST_ONLY_resetJoinQueue();
  __TEST_ONLY_setDb(openDb(':memory:'));
});

describe('joinQueue', () => {
  it('ignores joins while the queue is closed, without replying', () => {
    expect(join('1', 'でんせつ820')).toEqual({ result: 'closed', position: null, reply: null });
    expect(getPublicView().entries).toEqual([]);
  });

  it('adds people in order and replies with their position', () => {
    openQueue();
    expect(join('1', 'でんせつ820')).toMatchObject({ result: 'joined', position: 1 });
    const second = join('2');
    expect(second).toMatchObject({ result: 'joined', position: 2 });
    expect(second.reply).toContain('（2 番目）');
    expect(getPublicView().entries).toEqual([{ position: 1, userName: 'Viewer1' }, { position: 2, userName: 'Viewer2' }]);
  });

  it('keeps one slot per person and overwrites the rating, keeping the order', () => {
    openQueue();
    join('1', 'たつじん 40');
    join('2');
    expect(join('1', 'でんせつ820')).toMatchObject({ result: 'updated', position: 1 });
    const { entries } = getPanelView();
    expect(entries.map((e) => e.userId)).toEqual(['1', '2']);
    expect(entries[0].rating).toEqual({ tier: 8, points: 820, note: null });
    expect(entries[0].joinedAt).toBe(1000);
  });

  it('accepts unreadable ratings as unknown and adds how to write to the reply', () => {
    openQueue();
    const result = join('1', 'あいうえお');
    expect(result.result).toBe('joined');
    expect(result.reply).toContain('書き方: !参加 でんせつ820');
    expect(getPanelView().entries[0]).toMatchObject({ rating: null, unreadable: true });
  });

  it('refuses new people when the queue is full but lets people in it rewrite', () => {
    openQueue();
    for (let i = 1; i <= JOIN_QUEUE_MAX_ENTRIES; i++) join(String(i));
    expect(join('new')).toMatchObject({ result: 'full', position: null });
    expect(join('1', 'でんせつ')).toMatchObject({ result: 'updated' });
  });

  it('ignores chatter written right after !参加 that is not a rating, but accepts a rating written that way', () => {
    openQueue();
    expect(joinQueue({ userId: '1', userName: 'A', messageId: 'm', args: 'したい', attached: true })).toEqual({ result: 'ignored', position: null, reply: null });
    expect(joinQueue({ userId: '1', userName: 'A', messageId: 'm', args: 'でんせつ820', attached: true })).toMatchObject({ result: 'joined' });
    expect(getPublicView().entries).toHaveLength(1);
  });

  it('sanitizes the display name and falls back to the user id', () => {
    openQueue();
    join('1', '', 'Viewer‮A');
    join('2', '', '​');
    expect(getPublicView().entries.map((e) => e.userName)).toEqual(['ViewerA', '2']);
  });

  it('shows only numbers and names to the stream, and ratings only to the panel', () => {
    openQueue();
    join('1', 'でんせつ820');
    expect(JSON.stringify(getPublicView())).not.toContain('820');
    expect(getPanelView().entries[0].rating?.points).toBe(820);
    expect(JSON.stringify(getPanelView())).not.toContain('m-1');
  });
});

describe('cancelJoin', () => {
  it('removes the person and replies, or does nothing when they are not in the queue', () => {
    openQueue();
    join('1');
    expect(cancelJoin('1')).toEqual({ result: 'cancelled', position: null, reply: 'Viewer1 さん、受付を取り消しました。' });
    expect(cancelJoin('1')).toEqual({ result: 'notFound', position: null, reply: null });
  });
});

describe('callNext / removeFromQueue / closeQueue', () => {
  it('calls the first person and clears the current person when the queue is empty', () => {
    openQueue();
    join('1');
    join('2');
    callNext();
    expect(getPublicView()).toMatchObject({ current: 'Viewer1', entries: [{ position: 1, userName: 'Viewer2' }] });
    callNext();
    callNext();
    expect(getPublicView()).toMatchObject({ current: null, entries: [] });
  });

  it('removes someone from the queue or the current person', () => {
    openQueue();
    join('1');
    join('2');
    callNext();
    expect(removeFromQueue('2')).toBe(true);
    expect(removeFromQueue('1')).toBe(true);
    expect(removeFromQueue('1')).toBe(false);
    expect(getPublicView()).toMatchObject({ current: null, entries: [] });
  });

  it('clears the queue and stops accepting when closed', () => {
    openQueue();
    join('1');
    callNext();
    join('2');
    const before = getPublicView().revision;
    closeQueue();
    expect(getPublicView()).toEqual({ open: false, current: null, entries: [], hazard: null, revision: before + 1 });
  });
});

const recordGrade = (gradeName: string, gradePoint: number, playedAt: string) => addJob(
  { goldenEggs: 50, bossKills: 20, deaths: 1, cleared: true, waveReached: 3, stage: '', weapons: [], jobKind: 'regular' },
  1000, playedAt, {
    hazardLevel: 200, gradeName, gradePoint, jobPoint: null, jobScore: null, jobRate: null, clearBonus: null,
    teamGoldenEggs: null, teamPowerEggs: null, scaleBronze: null, scaleSilver: null, scaleGold: null, kingName: null, kingDefeated: null,
    waves: [], players: [], bosses: [],
  } satisfies SalmonJobDetails,
);

describe('getRecordedStreamerRating', () => {
  it('takes the latest recorded grade', () => {
    expect(getRecordedStreamerRating()).toBeNull();
    recordGrade('たつじん+2', 40, '2026/11/16 20:00');
    recordGrade('でんせつ', 820, '2026/11/16 20:10');
    expect(getRecordedStreamerRating()).toEqual({ rating: { tier: 8, points: 820, note: null }, ratedAt: Date.parse('2026-11-16T11:10:00Z') });
  });
});

describe('room hazard', () => {
  const context: HazardContext = { recordedStreamer: { rating: { tier: 8, points: 820, note: null }, ratedAt: 0 }, shiftStart: null };

  it('estimates from the streamer, the current person and the queue, showing only the rounded value to the stream', () => {
    openQueue();
    join('1', 'たつじん 40');
    join('2', '');
    callNext();
    // (1620 + 440) / 2 = 1030 → 206% → 約 210%。2 は不明、野良 1 人
    expect(getPublicView(context).hazard).toEqual({ value: 210, unknown: 1, wild: 1 });
    expect(getPanelView(context)).toMatchObject({
      streamer: { source: 'record' }, room: { estimate: 206, counted: 2 }, recommended: { practice: 90, normal: 205, challenge: 333 },
    });
  });

  it('lets the streamer type a rating that wins over the record, and go back to the record', () => {
    expect(setStreamerRating('あいうえお')).toBe(false);
    expect(setStreamerRating('たつじん+3 50', 5)).toBe(true);
    expect(getPanelView(context).streamer).toEqual({ rating: { tier: 7, points: 50, note: null }, ratedAt: 5, source: 'manual' });
    expect(setStreamerRating(null)).toBe(true);
    expect(getPanelView(context).streamer?.source).toBe('record');
    expect(getPanelView().streamer).toBeNull();
  });

  it('uses the record again when a job is imported after the typed rating', () => {
    setStreamerRating('でんせつ820', 100);
    const newer: HazardContext = { ...context, recordedStreamer: { rating: { tier: 8, points: 840, note: null }, ratedAt: 200 } };
    expect(getPanelView(newer).streamer).toMatchObject({ rating: { points: 840 }, source: 'record' });
    expect(getPanelView(context).streamer).toMatchObject({ rating: { points: 820 }, source: 'manual' });
  });

  it('updates when the rating was declared on rewriting', () => {
    openQueue();
    joinQueue({ userId: '1', userName: 'A', messageId: 'm', args: 'たつじん 40' }, 10);
    joinQueue({ userId: '1', userName: 'A', messageId: 'm', args: 'たつじん 50' }, 20);
    expect(getPanelView().entries[0]).toMatchObject({ joinedAt: 10, ratedAt: 20 });
  });
});
