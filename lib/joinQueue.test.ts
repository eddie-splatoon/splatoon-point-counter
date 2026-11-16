import { beforeEach, describe, expect, it } from 'vitest';

import {
  __TEST_ONLY_resetJoinQueue,
  callNext,
  cancelJoin,
  closeQueue,
  getPanelView,
  getPublicView,
  joinQueue,
  openQueue,
  removeFromQueue,
} from './joinQueue';
import { JOIN_QUEUE_MAX_ENTRIES } from './joinQueueTypes';

const join = (userId: string, args = '', userName = `Viewer${userId}`) =>
  joinQueue({ userId, userName, messageId: `m-${userId}`, args }, 1000);

beforeEach(() => {
  __TEST_ONLY_resetJoinQueue();
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
    expect(getPublicView()).toEqual({ open: false, current: null, entries: [], revision: before + 1 });
  });
});
