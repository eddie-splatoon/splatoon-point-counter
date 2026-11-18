import { act, renderHook, waitFor } from '@testing-library/react';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getDefaultSidePanelSettings } from '../lib/sidePanelTypes';

import { useSidePanelSettings } from './useSidePanelSettings';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

const base = getDefaultSidePanelSettings();

const deferred = () => {
  let resolve: (value: unknown) => void = () => {};
  let reject: (reason: unknown) => void = () => {};
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

const renderLoaded = async () => {
  const view = renderHook(() => useSidePanelSettings());
  await waitFor(() => expect(view.result.current.settings).not.toBeNull());
  return view;
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedAxios.get.mockResolvedValue({ data: base, status: 200 });
});

describe('useSidePanelSettings', () => {
  it('sends the saves one by one, each on top of the latest saved settings', async () => {
    // サーバーのように、保存したものを次の読み込みで返す（1 件目の保存は止めておく）
    let stored = base;
    mockedAxios.get.mockImplementation(async () => ({ data: stored, status: 200 }));
    const first = deferred();
    mockedAxios.post
      .mockImplementationOnce(async (_url, body) => { await first.promise; stored = body as typeof base; return { data: {}, status: 200 }; })
      .mockImplementation(async (_url, body) => { stored = body as typeof base; return { data: {}, status: 200 }; });
    const { result } = await renderLoaded();

    act(() => result.current.update({ rotateSeconds: 20 }));
    act(() => result.current.update({ followerGoal: 30 }));
    await waitFor(() => expect(mockedAxios.post).toHaveBeenCalledTimes(1));
    // 後の保存は前の保存が終わるまで送らず、画面は両方の変更を出したまま
    expect(result.current.settings).toMatchObject({ rotateSeconds: 20, followerGoal: 30 });

    await act(async () => first.resolve(undefined));
    await waitFor(() => expect(mockedAxios.post).toHaveBeenCalledTimes(2));
    // 後の保存は、前の保存を読み直した上に自分の変更を重ねる
    expect(mockedAxios.post.mock.calls[1][1]).toMatchObject({ rotateSeconds: 20, followerGoal: 30 });
    await waitFor(() => expect(result.current.settings).toMatchObject({ rotateSeconds: 20, followerGoal: 30 }));
  });

  it('still sends the next save after one fails, and shows the error', async () => {
    mockedAxios.post.mockRejectedValueOnce(new Error('500')).mockResolvedValue({ data: {}, status: 200 });
    const { result } = await renderLoaded();

    act(() => result.current.update({ rotateSeconds: 20 }));
    act(() => result.current.update({ followerGoal: 30 }));

    await waitFor(() => expect(mockedAxios.post).toHaveBeenCalledTimes(2));
    expect(mockedAxios.post.mock.calls[1][1]).toMatchObject({ followerGoal: 30 });
    expect(result.current.error).toBe('設定の保存に失敗しました。');
  });
});
