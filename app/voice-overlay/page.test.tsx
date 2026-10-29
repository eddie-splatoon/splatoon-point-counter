import { act, render } from '@testing-library/react';
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SpeechData } from '../../lib/voiceTypes';

import VoiceOverlayPage from './page';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

// 再生した音声を記録し、テストから再生終了・エラーを起こせるようにする
class FakeAudio {
  static instances: FakeAudio[] = [];
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public src: string) {
    FakeAudio.instances.push(this);
  }
  play() {
    return Promise.resolve();
  }
}

const queue = (...ids: number[]): { data: SpeechData; status: number } => ({
  data: { items: ids.map((id) => ({ id, text: `${id}`, createdAt: 0 })), serverTime: 0 },
  status: 200,
});

const played = () => FakeAudio.instances.map((audio) => audio.src);

let poll: () => Promise<void> = async () => {};

describe('VoiceOverlayPage', () => {
  beforeEach(() => {
    FakeAudio.instances = [];
    mockedAxios.get.mockReset();
    vi.stubGlobal('Audio', FakeAudio);
    // オーバーレイのポーリング（500ms）だけを手動で進められるようにし、waitFor などほかのタイマーはそのまま動かす
    const realSetInterval = global.setInterval;
    vi.spyOn(global, 'setInterval').mockImplementation(((callback: () => Promise<void>, ms?: number) => {
      if (ms !== 500) return realSetInterval(callback, ms);
      poll = callback;
      return 0;
    }) as unknown as typeof setInterval);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const renderWithInitialQueue = async (...ids: number[]) => {
    mockedAxios.get.mockResolvedValueOnce(queue(...ids));
    await act(async () => {
      render(<VoiceOverlayPage />);
    });
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
  };

  const pollWith = async (...ids: number[]) => {
    mockedAxios.get.mockResolvedValueOnce(queue(...ids));
    await act(async () => poll());
  };

  it('does not play what was already queued when the overlay opened', async () => {
    await renderWithInitialQueue(1, 2);
    await pollWith(1, 2);

    expect(played()).toEqual([]);
  });

  it('plays new items one at a time in order', async () => {
    await renderWithInitialQueue(1);
    await pollWith(1, 2, 3);

    expect(played()).toEqual(['/api/speech/audio?id=2']);

    await act(async () => FakeAudio.instances[0].onended?.());
    expect(played()).toEqual(['/api/speech/audio?id=2', '/api/speech/audio?id=3']);

    // 同じキューをもう一度取得しても、再生済みのものは再生しない
    await pollWith(1, 2, 3);
    expect(played()).toHaveLength(2);
  });

  it('moves on to the next item when an audio fails', async () => {
    await renderWithInitialQueue();
    await pollWith(5, 6);

    await act(async () => FakeAudio.instances[0].onerror?.());

    expect(played()).toEqual(['/api/speech/audio?id=5', '/api/speech/audio?id=6']);
  });

  it('moves on when the browser refuses to play', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(FakeAudio.prototype, 'play').mockRejectedValueOnce(new Error('NotAllowedError'));
    await renderWithInitialQueue();
    await pollWith(7, 8);

    expect(played()).toEqual(['/api/speech/audio?id=7', '/api/speech/audio?id=8']);
  });
});
