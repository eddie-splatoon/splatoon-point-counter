import { act, fireEvent, render, screen, within } from '@testing-library/react';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MAX_CHALLENGES, MAX_CHALLENGE_LINES, getDefaultSidePanelSettings } from '../lib/sidePanelTypes';

import SidePanelSettingsPanel from './SidePanelSettingsPanel';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

const renderLoaded = async (settings = getDefaultSidePanelSettings()) => {
  mockedAxios.get.mockResolvedValue({ data: settings, status: 200 });
  render(<SidePanelSettingsPanel />);
  await screen.findByText('📌 固定枠');
};

const lastPosted = () => mockedAxios.post.mock.calls.at(-1)?.[1];

beforeEach(() => {
  vi.clearAllMocks();
  mockedAxios.post.mockResolvedValue({ data: {}, status: 200 });
});

describe('SidePanelSettingsPanel', () => {
  // 固定枠とローテーション枠に同じ名前のボタンが並ぶので、枠を指定して探す
  const fixedButton = (name: string) => within(screen.getByRole('group', { name: '固定枠' })).getByRole('button', { name });
  const rotationButton = (name: string) => within(screen.getByRole('group', { name: 'ローテーション枠' })).getByRole('button', { name });

  it('shows the saved settings', async () => {
    await renderLoaded({ ...getDefaultSidePanelSettings(), fixedSlots: ['schedule'], rotationSlots: ['salmon', 'challenges'], rotateSeconds: 45 });

    expect(fixedButton('スケジュール')).toHaveAttribute('aria-pressed', 'true');
    expect(rotationButton('本日の戦績')).toHaveAttribute('aria-pressed', 'true');
    expect(rotationButton('本日のお題')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('切り替え秒数')).toHaveValue(45);
  });

  it('adds a fixed slot', async () => {
    await renderLoaded();

    await act(async () => fireEvent.click(fixedButton('スケジュール')));

    expect(lastPosted()).toMatchObject({ fixedSlots: ['schedule', 'salmon'], rotationSlots: [] });
    expect(fixedButton('スケジュール')).toHaveAttribute('aria-pressed', 'true');
  });

  it('adds rotation slots below the fixed ones', async () => {
    await renderLoaded({ ...getDefaultSidePanelSettings(), fixedSlots: ['schedule'], rotationSlots: [] });

    await act(async () => fireEvent.click(rotationButton('本日の戦績')));
    await act(async () => fireEvent.click(rotationButton('本日のお題')));

    expect(lastPosted()).toMatchObject({ fixedSlots: ['schedule'], rotationSlots: ['salmon', 'challenges'] });
  });

  it('does not let a fixed slot be chosen for the rotation', async () => {
    await renderLoaded({ ...getDefaultSidePanelSettings(), fixedSlots: ['schedule'], rotationSlots: ['salmon'] });

    expect(rotationButton('スケジュール')).toBeDisabled();
    expect(rotationButton('本日のお題')).toBeEnabled();
  });

  it('moves a rotating slot to the fixed area', async () => {
    await renderLoaded({ ...getDefaultSidePanelSettings(), fixedSlots: ['schedule'], rotationSlots: ['salmon', 'challenges'] });

    await act(async () => fireEvent.click(fixedButton('本日の戦績')));

    expect(lastPosted()).toMatchObject({ fixedSlots: ['schedule', 'salmon'], rotationSlots: ['challenges'] });
    expect(rotationButton('本日の戦績')).toBeDisabled();
  });

  it('fixes the burndown alone and turns off the rotation', async () => {
    await renderLoaded({ ...getDefaultSidePanelSettings(), fixedSlots: ['salmon'], rotationSlots: ['challenges'] });

    await act(async () => fireEvent.click(fixedButton('バーンダウン')));

    expect(lastPosted()).toMatchObject({ fixedSlots: ['burndown'], rotationSlots: [] });
    expect(rotationButton('本日のお題')).toBeDisabled();
  });

  it('releases a fixed burndown when another slot is fixed', async () => {
    await renderLoaded({ ...getDefaultSidePanelSettings(), fixedSlots: ['burndown'], rotationSlots: [] });

    await act(async () => fireEvent.click(fixedButton('本日のお題')));

    expect(lastPosted()).toMatchObject({ fixedSlots: ['challenges'], rotationSlots: [] });
  });

  it('rotates the burndown below fixed slots', async () => {
    await renderLoaded({ ...getDefaultSidePanelSettings(), fixedSlots: ['schedule'], rotationSlots: [] });

    await act(async () => fireEvent.click(rotationButton('バーンダウン')));

    expect(lastPosted()).toMatchObject({ fixedSlots: ['schedule'], rotationSlots: ['burndown'] });
  });

  it('keeps at least one slot across both areas', async () => {
    await renderLoaded();

    await act(async () => fireEvent.click(fixedButton('本日の戦績')));

    expect(mockedAxios.post).not.toHaveBeenCalled();
    expect(fixedButton('本日の戦績')).toHaveAttribute('aria-pressed', 'true');
  });

  it('allows emptying the fixed area while something rotates', async () => {
    await renderLoaded({ ...getDefaultSidePanelSettings(), fixedSlots: ['salmon'], rotationSlots: ['challenges'] });

    await act(async () => fireEvent.click(fixedButton('本日の戦績')));

    expect(lastPosted()).toMatchObject({ fixedSlots: [], rotationSlots: ['challenges'] });
  });

  it('saves the rotation seconds only when they are valid', async () => {
    await renderLoaded();
    const input = screen.getByLabelText('切り替え秒数');

    await act(async () => fireEvent.change(input, { target: { value: '3' } }));
    expect(mockedAxios.post).not.toHaveBeenCalled();
    expect(input).toHaveAttribute('aria-invalid', 'true');

    await act(async () => fireEvent.change(input, { target: { value: '15' } }));
    expect(lastPosted()).toMatchObject({ rotateSeconds: 15 });
  });

  it('reloads the saved settings when saving fails', async () => {
    await renderLoaded();
    mockedAxios.post.mockRejectedValue(new Error('500'));

    await act(async () => fireEvent.click(fixedButton('スケジュール')));

    expect(screen.getByText('設定の保存に失敗しました。')).toBeInTheDocument();
    expect(fixedButton('スケジュール')).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows the saved follower goal', async () => {
    await renderLoaded({ ...getDefaultSidePanelSettings(), followerGoal: 20 });
    expect(screen.getByLabelText('目標フォロワー数')).toHaveValue(20);
  });

  it('saves the follower goal, and clears it when the field is emptied', async () => {
    await renderLoaded();
    const input = screen.getByLabelText('目標フォロワー数');

    await act(async () => fireEvent.change(input, { target: { value: '20' } }));
    expect(lastPosted()).toMatchObject({ followerGoal: 20 });

    await act(async () => fireEvent.change(input, { target: { value: '' } }));
    expect(lastPosted()).toMatchObject({ followerGoal: null });
  });

  it('does not save an invalid follower goal', async () => {
    await renderLoaded();
    const input = screen.getByLabelText('目標フォロワー数');

    await act(async () => fireEvent.change(input, { target: { value: '0' } }));

    expect(mockedAxios.post).not.toHaveBeenCalled();
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  describe('challenges', () => {
    const challenges = [
      { id: 1, text: 'キケン度MAXでクリア', done: false },
      { id: 3, text: '新ブキで3クリア', done: true },
    ];

    it('shows the saved challenges', async () => {
      await renderLoaded({ ...getDefaultSidePanelSettings(), challenges });

      expect(screen.getByRole('checkbox', { name: 'キケン度MAXでクリア' })).not.toBeChecked();
      expect(screen.getByRole('checkbox', { name: '新ブキで3クリア' })).toBeChecked();
    });

    it('adds a challenge with the next id', async () => {
      await renderLoaded({ ...getDefaultSidePanelSettings(), challenges });

      fireEvent.change(screen.getByLabelText('新しいお題'), { target: { value: '  オカシラを倒す ' } });
      await act(async () => fireEvent.click(screen.getByRole('button', { name: '追加' })));

      expect(lastPosted()).toMatchObject({ challenges: [...challenges, { id: 4, text: 'オカシラを倒す', done: false }] });
      expect(screen.getByLabelText('新しいお題')).toHaveValue('');
    });

    it.each([['Ctrl', { ctrlKey: true }], ['⌘', { metaKey: true }]])('adds a challenge with %s + Enter', async (_, modifier) => {
      await renderLoaded();

      fireEvent.change(screen.getByLabelText('新しいお題'), { target: { value: 'オカシラを倒す' } });
      await act(async () => fireEvent.keyDown(screen.getByLabelText('新しいお題'), { key: 'Enter', ...modifier }));

      expect(lastPosted()).toMatchObject({ challenges: [{ id: 1, text: 'オカシラを倒す', done: false }] });
    });

    it('does not add a challenge while the IME is composing', async () => {
      await renderLoaded();

      fireEvent.change(screen.getByLabelText('新しいお題'), { target: { value: 'オカシラ' } });
      await act(async () => fireEvent.keyDown(screen.getByLabelText('新しいお題'), { key: 'Enter', ctrlKey: true, isComposing: true }));

      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('does not add a challenge with Enter alone, which starts a new line', async () => {
      await renderLoaded();

      fireEvent.change(screen.getByLabelText('新しいお題'), { target: { value: 'オカシラを倒す' } });
      await act(async () => fireEvent.keyDown(screen.getByLabelText('新しいお題'), { key: 'Enter' }));

      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('keeps line breaks in a new challenge', async () => {
      await renderLoaded();

      fireEvent.change(screen.getByLabelText('新しいお題'), { target: { value: 'キケン度MAXで\n 3連続クリア \n\n' } });
      await act(async () => fireEvent.click(screen.getByRole('button', { name: '追加' })));

      expect(lastPosted()).toMatchObject({ challenges: [{ id: 1, text: 'キケン度MAXで\n3連続クリア', done: false }] });
    });

    it('does not add a challenge with too many lines', async () => {
      await renderLoaded();
      const input = screen.getByLabelText('新しいお題');

      fireEvent.change(input, { target: { value: Array.from({ length: MAX_CHALLENGE_LINES + 1 }, (_, i) => `行${i}`).join('\n') } });

      expect(screen.getByRole('button', { name: '追加' })).toBeDisabled();
      expect(input).toHaveAttribute('aria-invalid', 'true');
    });

    it('does not add an empty challenge', async () => {
      await renderLoaded();

      fireEvent.change(screen.getByLabelText('新しいお題'), { target: { value: '   ' } });

      expect(screen.getByRole('button', { name: '追加' })).toBeDisabled();
    });

    it('does not add more than the maximum', async () => {
      const full = Array.from({ length: MAX_CHALLENGES }, (_, i) => ({ id: i + 1, text: `お題${i + 1}`, done: false }));
      await renderLoaded({ ...getDefaultSidePanelSettings(), challenges: full });

      fireEvent.change(screen.getByLabelText('新しいお題'), { target: { value: 'もう1つ' } });

      expect(screen.getByRole('button', { name: '追加' })).toBeDisabled();
    });

    it('checks a challenge as cleared', async () => {
      await renderLoaded({ ...getDefaultSidePanelSettings(), challenges });

      await act(async () => fireEvent.click(screen.getByRole('checkbox', { name: 'キケン度MAXでクリア' })));

      expect(lastPosted()).toMatchObject({ challenges: [{ ...challenges[0], done: true }, challenges[1]] });
    });

    it('deletes a challenge', async () => {
      await renderLoaded({ ...getDefaultSidePanelSettings(), challenges });

      await act(async () => fireEvent.click(screen.getByRole('button', { name: 'お題「キケン度MAXでクリア」を削除' })));

      expect(lastPosted()).toMatchObject({ challenges: [challenges[1]] });
      expect(screen.queryByText('キケン度MAXでクリア')).not.toBeInTheDocument();
    });
  });

  it('shows an error when loading fails', async () => {
    mockedAxios.get.mockRejectedValue(new Error('500'));
    render(<SidePanelSettingsPanel />);

    expect(await screen.findByText(/読み込みに失敗しました/)).toBeInTheDocument();
  });
});
