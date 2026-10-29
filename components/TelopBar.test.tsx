import { act, fireEvent, render, screen, within } from '@testing-library/react';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TelopPreset, getDefaultTelopSettings } from '../lib/telopTypes';

import TelopBar from './TelopBar';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

const respondWith = (presets: TelopPreset[]) =>
  mockedAxios.get.mockResolvedValue({ data: { presets, current: null, revision: 0 }, status: 200 });

const renderLoaded = async (presets: TelopPreset[] = getDefaultTelopSettings().presets) => {
  respondWith(presets);
  const view = render(<TelopBar />);
  await screen.findByTestId('telop-buttons');
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

    expect(buttons().getByRole('button', { name: '2カタパッド残った…' })).toBeInTheDocument();
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

  it('reloads the presets when reloadKey changes', async () => {
    const { rerender } = await renderLoaded();
    respondWith([{ id: 7, text: 'カンスト!', speak: false, followFont: true }]);

    rerender(<TelopBar reloadKey={1} />);

    expect(await buttons().findByRole('button', { name: /カンスト!/ })).toBeInTheDocument();
    await act(async () => fireEvent.keyDown(document.body, { key: '1' }));
    expect(mockedAxios.post).toHaveBeenCalledWith('/api/telop', { presetId: 7 });
  });

  it('guides to the telop tab when there are no presets', async () => {
    respondWith([]);
    render(<TelopBar />);

    expect(await screen.findByText(/「テロップ」タブで追加できます/)).toBeInTheDocument();
  });

  it('shows an error when the presets cannot be loaded', async () => {
    mockedAxios.get.mockRejectedValue(new Error('network'));
    render(<TelopBar />);

    expect(await screen.findByText('テロップのプリセットを読み込めませんでした。')).toBeInTheDocument();
  });
});
