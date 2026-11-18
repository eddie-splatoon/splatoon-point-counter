import { act, fireEvent, render, screen, within } from '@testing-library/react';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TELOP_DISPLAY_DURATION, TelopPreset, getDefaultTelopSettings } from '../lib/telopTypes';

import { TelopPresetsProvider, useTelopPresets } from './controlPanelContext';
import TelopBar from './TelopBar';
import { useTelopHotkeys } from './useTelopHotkeys';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

// コントロールパネルの外枠と同じく、プリセットの共有・数字キー・読み込み直し（設定でプリセットを編集したとき）を組み合わせる
const Hotkeys = () => {
  const { presets, show } = useTelopPresets();
  useTelopHotkeys(presets, show);
  return null;
};
const ReloadButton = () => <button onClick={useTelopPresets().reload}>読み込み直す</button>;
const Harness = () => (
  <TelopPresetsProvider>
    <Hotkeys />
    <TelopBar />
    <ReloadButton />
  </TelopPresetsProvider>
);

const respondWith = (presets: TelopPreset[]) =>
  mockedAxios.get.mockResolvedValue({ data: { presets, current: null, revision: 0 }, status: 200 });

const renderLoaded = async (presets: TelopPreset[] = getDefaultTelopSettings().presets) => {
  respondWith(presets);
  const view = render(<Harness />);
  await screen.findByTestId('telop-buttons');
  // findBy の待機中の描画は act の外なので、キーボードのリスナーを登録する effect がまだ走っていないことがある（CI で不安定になる）。
  // 残りの effect を流し切ってからキーを押す
  await act(async () => {});
  return view;
};

const buttons = () => within(screen.getByTestId('telop-buttons'));

beforeEach(() => {
  vi.clearAllMocks();
  mockedAxios.post.mockResolvedValue({ data: {}, status: 200 });
});

describe('TelopBar', () => {
  it('shows a preset when its button is clicked', async () => {
    await renderLoaded();

    await act(async () => fireEvent.click(buttons().getByRole('button', { name: /満潮きた/ })));

    expect(mockedAxios.post).toHaveBeenCalledWith('/api/telop', { presetId: 3 });
  });

  it('shows the shortcut key on each button', async () => {
    await renderLoaded();

    expect(buttons().getByRole('button', { name: /^2\s*カタパッド残った…$/ })).toBeInTheDocument();
  });

  it('puts presets beyond the shortcut keys under "more" and remembers whether it is open', async () => {
    localStorage.clear();
    const presets = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, text: `p${i + 1}`, speak: false, followFont: true, display: true, chat: false }));
    const { unmount } = await renderLoaded(presets);

    expect(buttons().getByRole('button', { name: /^0\s*p10$/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'p11' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ほかのテロップ（2）' }));
    await act(async () => fireEvent.click(within(screen.getByTestId('telop-more')).getByRole('button', { name: 'p11' })));
    expect(mockedAxios.post).toHaveBeenCalledWith('/api/telop', { presetId: 11 });

    // 開き直しても開いたまま
    unmount();
    await renderLoaded(presets);
    expect(screen.getByRole('button', { name: 'たたむ' })).toHaveAttribute('aria-expanded', 'true');
    expect(within(screen.getByTestId('telop-more')).getByRole('button', { name: 'p12' })).toBeInTheDocument();
    localStorage.clear();
  });

  it('marks comment-only presets', async () => {
    await renderLoaded([
      { id: 1, text: 'ナイス!', speak: false, followFont: true, display: true, chat: true },
      { id: 2, text: 'おつかれ', speak: false, followFont: true, display: false, chat: true },
    ]);

    expect(buttons().getByRole('button', { name: /ナイス!/ })).not.toContainElement(screen.queryByRole('img', { name: 'チャットだけ' }));
    expect(within(buttons().getByRole('button', { name: /おつかれ/ })).getByRole('img', { name: 'チャットだけ' })).toBeInTheDocument();
  });

  it('marks the telop on screen while it is shown, also when shown with a number key', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await renderLoaded();

    await act(async () => fireEvent.keyDown(document.body, { key: '2' }));
    expect(buttons().getByRole('button', { name: /カタパッド残った…/ })).toHaveTextContent('表示中');

    await act(async () => { await vi.advanceTimersByTimeAsync(TELOP_DISPLAY_DURATION); });
    expect(buttons().getByRole('button', { name: /カタパッド残った…/ })).not.toHaveTextContent('表示中');
    vi.useRealTimers();
  });

  it('does not mark a telop that could not be shown or that only goes to the chat', async () => {
    await renderLoaded([{ id: 1, text: 'おつかれ', speak: false, followFont: true, display: false, chat: true }]);
    await act(async () => fireEvent.keyDown(document.body, { key: '1' }));
    expect(screen.queryByText('表示中')).not.toBeInTheDocument();

    mockedAxios.post.mockRejectedValueOnce(new Error('network'));
    await act(async () => fireEvent.click(buttons().getByRole('button', { name: /おつかれ/ })));
    expect(screen.queryByText('表示中')).not.toBeInTheDocument();
  });

  it('shows the preset assigned to a number key', async () => {
    await renderLoaded();

    await act(async () => fireEvent.keyDown(document.body, { key: '2' }));

    expect(mockedAxios.post).toHaveBeenCalledWith('/api/telop', { presetId: 2 });
  });

  it.each([
    ['while typing in an input', { key: '1' }, true],
    ['with a modifier key', { key: '1', ctrlKey: true }, false],
    ['during IME composition', { key: '1', isComposing: true }, false],
    ['on key repeat', { key: '1', repeat: true }, false],
    ['for a key without a preset', { key: '9' }, false],
  ])('ignores number keys %s', async (_, event, inInput) => {
    await renderLoaded();
    const input = document.createElement('input');
    document.body.appendChild(input);

    await act(async () => fireEvent.keyDown(inInput ? input : document.body, event));

    expect(mockedAxios.post).not.toHaveBeenCalled();
    input.remove();
  });

  it.each(['combobox', 'option'])('ignores number keys on a dropdown (role=%s)', async (role) => {
    await renderLoaded();
    const dropdown = document.createElement('div');
    dropdown.setAttribute('role', role);
    dropdown.tabIndex = 0;
    document.body.appendChild(dropdown);

    await act(async () => fireEvent.keyDown(dropdown, { key: '2' }));

    expect(mockedAxios.post).not.toHaveBeenCalled();
    dropdown.remove();
  });

  it('shows an error when showing a telop fails', async () => {
    await renderLoaded();
    mockedAxios.post.mockRejectedValueOnce(new Error('network'));

    await act(async () => fireEvent.keyDown(document.body, { key: '1' }));

    expect(screen.getByText('テロップを出せませんでした。')).toBeInTheDocument();
  });

  it('reloads the presets when they are edited in the settings', async () => {
    await renderLoaded();
    respondWith([{ id: 7, text: 'カンスト!', speak: false, followFont: true, display: true, chat: false }]);

    fireEvent.click(screen.getByRole('button', { name: '読み込み直す' }));

    expect(await buttons().findByRole('button', { name: /カンスト!/ })).toBeInTheDocument();
    await act(async () => fireEvent.keyDown(document.body, { key: '1' }));
    expect(mockedAxios.post).toHaveBeenCalledWith('/api/telop', { presetId: 7 });
  });

  it('guides to the settings when there are no presets', async () => {
    respondWith([]);
    render(<Harness />);

    expect(await screen.findByText(/設定の「テロップのプリセット」で追加できます/)).toBeInTheDocument();
  });

  it('shows an error when the presets cannot be loaded', async () => {
    mockedAxios.get.mockRejectedValue(new Error('network'));
    render(<Harness />);

    expect(await screen.findByText('テロップのプリセットを読み込めませんでした。')).toBeInTheDocument();
  });
});
