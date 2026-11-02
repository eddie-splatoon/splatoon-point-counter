// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';

import { completeClip, deleteClip, listClips, listPendingClips, requestClip } from './clips';
import { CLIP_EXPIRED_ERROR, CLIP_REQUEST_TTL_MS, parseClipResult } from './clipTypes';
import { __TEST_ONLY_setDb, openDb } from './db';

const created = { status: 'created', clipId: 'FunnyClip-abc_123', editUrl: 'https://clips.twitch.tv/FunnyClip-abc_123/edit' } as const;

beforeEach(() => {
  __TEST_ONLY_setDb(openDb(':memory:'));
});

describe('clip requests', () => {
  it('records a pending request', () => {
    const clip = requestClip('voice', 1000);
    expect(clip).toMatchObject({ source: 'voice', status: 'pending', requestedAt: 1000, clipId: null, editUrl: null, error: null });
    expect(listPendingClips(1000)).toEqual([clip]);
  });

  it('returns the pending request instead of creating another one', () => {
    const first = requestClip('voice', 1000);
    expect(requestClip('button', 2000)).toEqual(first);
    expect(listClips(50, 2000)).toHaveLength(1);
  });

  it('expires requests that were not processed in time', () => {
    const first = requestClip('voice', 1000);
    const later = 1000 + CLIP_REQUEST_TTL_MS + 1;
    expect(listPendingClips(later)).toEqual([]);
    expect(listClips(50, later)[0]).toMatchObject({ id: first.id, status: 'failed', error: CLIP_EXPIRED_ERROR, completedAt: later });

    // 期限切れの後は新しく依頼できる
    expect(requestClip('voice', later).id).not.toBe(first.id);
  });

  it('writes the result only once', () => {
    const { id } = requestClip('voice', 1000);
    expect(completeClip(id, created, 2000)).toMatchObject({ status: 'created', clipId: created.clipId, editUrl: created.editUrl, completedAt: 2000 });
    expect(completeClip(id, { status: 'failed', error: 'x' }, 3000)).toBeNull();
    expect(completeClip(999, created)).toBeNull();
  });

  it('keeps a clip that was created after the request expired', () => {
    const { id } = requestClip('voice', 1000);
    listClips(50, 1000 + CLIP_REQUEST_TTL_MS + 1);
    expect(completeClip(id, created)).toMatchObject({ status: 'created', error: null });
  });

  it('lists clips newest first and deletes them from the history', () => {
    const first = requestClip('voice', 1000);
    completeClip(first.id, { status: 'failed', error: 'offline' }, 1500);
    const second = requestClip('button', 2000);
    expect(listClips(50, 2000).map((c) => c.id)).toEqual([second.id, first.id]);

    expect(deleteClip(first.id, 2000)).toBe('deleted');
    expect(deleteClip(first.id, 2000)).toBe('notFound');
    expect(listClips(50, 2000).map((c) => c.id)).toEqual([second.id]);
  });

  it('does not delete a pending request until it expires', () => {
    const { id } = requestClip('voice', 1000);
    expect(deleteClip(id, 2000)).toBe('pending');
    expect(deleteClip(id, 1000 + CLIP_REQUEST_TTL_MS + 1)).toBe('deleted');
  });
});

describe('parseClipResult', () => {
  it('accepts a created or failed result', () => {
    expect(parseClipResult({ id: 1, ...created })).toEqual({ id: 1, result: created });
    expect(parseClipResult({ id: 1, status: 'failed', error: ' offline ' })).toEqual({ id: 1, result: { status: 'failed', error: 'offline' } });
  });

  it('truncates a long error', () => {
    const result = parseClipResult({ id: 1, status: 'failed', error: 'あ'.repeat(300) });
    expect(typeof result !== 'string' && result.result.status === 'failed' && result.result.error).toHaveLength(200);
  });

  it.each([
    [{ ...created }, 'id'],
    [{ id: 0, ...created }, 'id'],
    [{ id: 1, status: 'pending' }, 'status'],
    [{ id: 1, ...created, clipId: '../x' }, 'clipId'],
    [{ id: 1, ...created, editUrl: 'http://clips.twitch.tv/x/edit' }, 'editUrl'],
    [{ id: 1, ...created, editUrl: 'javascript:alert(1)' }, 'editUrl'],
    [{ id: 1, ...created, editUrl: 'https://evil.example/clips.twitch.tv' }, 'editUrl'],
    [{ id: 1, ...created, editUrl: 'https://clips.twitch.tv.evil.example/x' }, 'editUrl'],
    [{ id: 1, status: 'failed', error: ' ' }, 'error'],
  ])('rejects %j', (body, field) => {
    expect(parseClipResult(body)).toContain(field);
  });
});
