// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CACHE_TTL_MS, GET, MAX_RESPONSE_BYTES, RETRY_AFTER_FAILURE_MS, __TEST_ONLY_resetSalmonScheduleCache } from './route';

const weapons = [1, 2, 3, 4].map((i) => ({ name: `ブキ${i}`, image: `https://example.com/w${i}.png` }));
const result = (name: string, isBigRun = false) => ({
  start_time: '2026-10-27T17:00:00+09:00',
  end_time: '2026-10-29T09:00:00+09:00',
  stage: { name, image: 'https://example.com/stage.png' },
  weapons,
  is_big_run: isBigRun,
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const fetchMock = vi.fn();
const scheduleCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/coop-grouping/schedule'));

const respondWith = (stage: string) => {
  fetchMock.mockImplementation(async (url: string) =>
    url.endsWith('/coop-grouping/schedule') ? json({ results: [result(stage)] }) : json({ results: [] }));
};

beforeEach(() => {
  __TEST_ONLY_resetSalmonScheduleCache();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-28T12:00:00+09:00'));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Salmon schedule API', () => {
  it('returns the schedule including team contests, with a contact User-Agent', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      json({ results: [url.endsWith('/coop-grouping/schedule') ? result('通常') : result('コンテスト')] }));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.entries.map((e: { kind: string; stage: { name: string } }) => [e.kind, e.stage.name])).toEqual([
      ['regular', '通常'],
      ['teamContest', 'コンテスト'],
    ]);
    expect(fetchMock).toHaveBeenCalledWith('https://spla3.yuu26.com/api/coop-grouping/schedule', expect.objectContaining({
      headers: { 'User-Agent': expect.stringContaining('github.com/eddie-splatoon/splatoon-point-counter') },
    }));
  });

  it('serves the cached schedule within the cache period', async () => {
    respondWith('A');
    await GET();
    respondWith('B');

    vi.setSystemTime(Date.now() + CACHE_TTL_MS - 1);
    const body = await (await GET()).json();

    expect(body.entries[0].stage.name).toBe('A');
    expect(scheduleCalls()).toHaveLength(1);
  });

  it('fetches again after the cache expires', async () => {
    respondWith('A');
    await GET();
    respondWith('B');

    vi.setSystemTime(Date.now() + CACHE_TTL_MS);

    expect((await (await GET()).json()).entries[0].stage.name).toBe('B');
  });

  it('fetches only once for concurrent requests', async () => {
    respondWith('A');
    await Promise.all([GET(), GET(), GET()]);
    expect(scheduleCalls()).toHaveLength(1);
  });

  it('still returns the regular schedule when the team contest fetch fails', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith('/coop-grouping/schedule') ? json({ results: [result('通常')] }) : json({}, 500));

    const body = await (await GET()).json();
    expect(body.entries).toHaveLength(1);
  });

  it('returns the last schedule when fetching fails, and waits before retrying', async () => {
    respondWith('A');
    await GET();
    fetchMock.mockImplementation(async () => json({}, 500));

    vi.setSystemTime(Date.now() + CACHE_TTL_MS);
    const response = await GET();
    expect(response.status).toBe(200);
    expect((await response.json()).entries[0].stage.name).toBe('A');
    const callsAfterFailure = scheduleCalls().length;

    vi.setSystemTime(Date.now() + RETRY_AFTER_FAILURE_MS - 1);
    await GET();
    expect(scheduleCalls()).toHaveLength(callsAfterFailure);

    respondWith('B');
    vi.setSystemTime(Date.now() + 1);
    expect((await (await GET()).json()).entries[0].stage.name).toBe('B');
  });

  it('returns 502 when nothing has been fetched yet', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    expect((await GET()).status).toBe(502);
  });

  it('passes a timeout signal to every request', async () => {
    respondWith('A');
    await GET();

    for (const [, init] of fetchMock.mock.calls) {
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it('treats a timed-out request as a failure', async () => {
    fetchMock.mockRejectedValue(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));

    expect((await GET()).status).toBe(502);
  });

  it('rejects a response that is too large without reading all of it', async () => {
    const chunk = new Uint8Array(MAX_RESPONSE_BYTES / 4);
    let pulled = 0;
    const cancel = vi.fn();
    fetchMock.mockImplementation(async () => new Response(new ReadableStream({
      pull(controller) {
        pulled += 1;
        controller.enqueue(chunk);
      },
      cancel,
    })));

    expect((await GET()).status).toBe(502);
    expect(cancel).toHaveBeenCalled();
    // 上限（4チャンク分）を超えた時点で止まり、終わりのない応答を読み続けない
    expect(pulled).toBeLessThan(20);
  });

  it('rejects a response whose declared size is too large', async () => {
    fetchMock.mockImplementation(async () => new Response('{}', { headers: { 'content-length': String(MAX_RESPONSE_BYTES + 1) } }));

    expect((await GET()).status).toBe(502);
  });

  it('decodes a multi-byte response read in chunks', async () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ results: [result('ムニ・エール海洋発電所')] }));
    fetchMock.mockImplementation(async (url: string) => url.endsWith('/coop-grouping/schedule')
      ? new Response(new ReadableStream({
        start(controller) {
          // マルチバイト文字の途中で区切っても正しく復元できること
          for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7));
          controller.close();
        },
      }))
      : json({ results: [] }));

    expect((await (await GET()).json()).entries[0].stage.name).toBe('ムニ・エール海洋発電所');
  });

  it('treats a response without usable entries as a failure', async () => {
    fetchMock.mockImplementation(async () => json({ results: [] }));

    expect((await GET()).status).toBe(502);
  });
});
