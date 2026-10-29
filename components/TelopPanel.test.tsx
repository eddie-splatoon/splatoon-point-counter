import { act, fireEvent, render, screen, within } from '@testing-library/react';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MAX_TELOP_PRESETS, TelopPreset, getDefaultTelopSettings } from '../lib/telopTypes';

import TelopPanel from './TelopPanel';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

const renderLoaded = async (presets: TelopPreset[] = getDefaultTelopSettings().presets) => {
  mockedAxios.get.mockResolvedValue({ data: { presets, current: null, revision: 0 }, status: 200 });
  render(<TelopPanel />);
  await screen.findByText('📣 テロップを出す');
};

const lastPosted = () => mockedAxios.post.mock.calls.at(-1)?.[1];
const lastPut = () => mockedAxios.put.mock.calls.at(-1)?.[1] as { presets: TelopPreset[] };
const buttons = () => within(screen.getByTestId('telop-buttons'));

beforeEach(() => {
  vi.clearAllMocks();
  mockedAxios.post.mockResolvedValue({ data: {}, status: 200 });
  mockedAxios.put.mockResolvedValue({ data: {}, status: 200 });
});

describe('TelopPanel', () => {
  it('shows a preset when its button is clicked', async () => {
    await renderLoaded();

    await act(async () => fireEvent.click(buttons().getByRole('button', { name: /満潮きた/ })));

    expect(mockedAxios.post).toHaveBeenCalledWith('/api/telop', { presetId: 3 });
  });

  it('shows the preset assigned to a number key', async () => {
    await renderLoaded();

    await act(async () => fireEvent.keyDown(document.body, { key: '2' }));

    expect(lastPosted()).toEqual({ presetId: 2 });
  });

  it.each([
    ['while typing in an input', { key: '1' }, true],
    ['with a modifier key', { key: '1', ctrlKey: true }, false],
    ['during IME composition', { key: '1', isComposing: true }, false],
    ['for a key without a preset', { key: '9' }, false],
  ])('ignores number keys %s', async (_, event, inInput) => {
    await renderLoaded();

    const target = inInput ? screen.getByLabelText('自由入力') : document.body;
    await act(async () => fireEvent.keyDown(target, event));

    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('shows free text with Enter and clears the input', async () => {
    await renderLoaded();
    const input = screen.getByLabelText('自由入力');

    fireEvent.change(input, { target: { value: ' ありがとう ' } });
    await act(async () => fireEvent.keyDown(input, { key: 'Enter' }));

    expect(lastPosted()).toEqual({ text: 'ありがとう' });
    expect(input).toHaveValue('');
  });

  it('keeps the free text when showing it fails', async () => {
    await renderLoaded();
    mockedAxios.post.mockRejectedValueOnce(new Error('network'));
    const input = screen.getByLabelText('自由入力');

    fireEvent.change(input, { target: { value: 'ありがとう' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '出す' })));

    expect(screen.getByText('テロップを出せませんでした。')).toBeInTheDocument();
    expect(input).toHaveValue('ありがとう');
  });

  it('does not show free text on Enter during IME composition', async () => {
    await renderLoaded();
    const input = screen.getByLabelText('自由入力');

    fireEvent.change(input, { target: { value: 'ありがとう' } });
    await act(async () => fireEvent.keyDown(input, { key: 'Enter', isComposing: true }));

    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('adds a preset with the next id', async () => {
    await renderLoaded();

    fireEvent.change(screen.getByLabelText('新しいプリセット'), { target: { value: 'カンスト!' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '追加' })));

    expect(lastPut()).toEqual({ presets: [...getDefaultTelopSettings().presets, { id: 5, text: 'カンスト!', speak: false }] });
    expect(buttons().getByRole('button', { name: /カンスト!/ })).toBeInTheDocument();
  });

  it('cannot add more than the maximum number of presets', async () => {
    await renderLoaded(Array.from({ length: MAX_TELOP_PRESETS }, (_, i) => ({ id: i + 1, text: `p${i + 1}`, speak: false })));

    fireEvent.change(screen.getByLabelText('新しいプリセット'), { target: { value: 'もう1つ' } });

    expect(screen.getByRole('button', { name: '追加' })).toBeDisabled();
  });

  it('toggles reading aloud, reorders and deletes presets', async () => {
    await renderLoaded();
    const [nice, catapad] = getDefaultTelopSettings().presets;

    await act(async () => fireEvent.click(screen.getByLabelText('「カタパッド残った…」を読み上げる')));
    expect(lastPut().presets[1]).toEqual({ ...catapad, speak: true });

    await act(async () => fireEvent.click(screen.getByRole('button', { name: '「カタパッド残った…」を上へ' })));
    expect(lastPut().presets.slice(0, 2).map((p) => p.id)).toEqual([catapad.id, nice.id]);

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'プリセット「ナイス!」を削除' })));
    expect(lastPut().presets.map((p) => p.text)).toEqual(['カタパッド残った…', '満潮きた', 'ヘルプ感謝']);
  });

  it('sends preset saves one at a time in order', async () => {
    await renderLoaded();
    let finishFirst: () => void = () => {};
    mockedAxios.put.mockImplementationOnce(() => new Promise((resolve) => { finishFirst = () => resolve({ data: {}, status: 200 }); }));

    await act(async () => fireEvent.click(screen.getByLabelText('「ナイス!」を読み上げる')));
    await act(async () => fireEvent.click(screen.getByLabelText('「満潮きた」を読み上げる')));
    expect(mockedAxios.put).toHaveBeenCalledTimes(1);

    await act(async () => finishFirst());
    expect(mockedAxios.put).toHaveBeenCalledTimes(2);
    expect(lastPut().presets.map((p) => p.speak)).toEqual([false, false, true, true]);
  });

  it('reloads the presets when saving fails', async () => {
    await renderLoaded();
    mockedAxios.put.mockRejectedValueOnce(new Error('network'));

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'プリセット「ナイス!」を削除' })));

    expect(screen.getByText('プリセットの保存に失敗しました。')).toBeInTheDocument();
    expect(buttons().getByRole('button', { name: /ナイス!/ })).toBeInTheDocument();
  });
});
