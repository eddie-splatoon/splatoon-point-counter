import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getDefaultSidePanelSettings } from '../lib/sidePanelTypes';

import SidePanelSettingsPanel from './SidePanelSettingsPanel';
import { useSidePanelSettings } from './useSidePanelSettings';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

// 準備の画面と同じく、設定は useSidePanelSettings で読み込んで渡す
const Harness = () => <SidePanelSettingsPanel state={useSidePanelSettings()} />;

const renderLoaded = async (settings = getDefaultSidePanelSettings()) => {
  mockedAxios.get.mockResolvedValue({ data: settings, status: 200 });
  render(<Harness />);
  await screen.findByRole('group', { name: /^固定枠/ });
};

const lastPosted = () => mockedAxios.post.mock.calls.at(-1)?.[1];

beforeEach(() => {
  vi.clearAllMocks();
  mockedAxios.post.mockResolvedValue({ data: {}, status: 200 });
});

describe('SidePanelSettingsPanel', () => {
  // 固定枠とローテーション枠に同じ名前のボタンが並ぶので、枠を指定して探す
  const fixedButton = (name: string) => within(screen.getByRole('group', { name: /^固定枠/ })).getByRole('button', { name });
  const rotationButton = (name: string) => within(screen.getByRole('group', { name: /^ローテーション枠/ })).getByRole('button', { name });

  it('shows the saved settings', async () => {
    await renderLoaded({ ...getDefaultSidePanelSettings(), fixedSlots: ['schedule'], rotationSlots: ['salmon', 'challenges'], rotateSeconds: 45 });

    expect(fixedButton('スケジュール')).toHaveAttribute('aria-pressed', 'true');
    expect(rotationButton('本日の戦績')).toHaveAttribute('aria-pressed', 'true');
    expect(rotationButton('本日のお題')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('切り替えの秒数')).toHaveValue(45);
  });

  it('adds a fixed slot', async () => {
    await renderLoaded();

    await act(async () => fireEvent.click(fixedButton('スケジュール')));

    await waitFor(() => expect(lastPosted()).toMatchObject({ fixedSlots: ['schedule', 'salmon'], rotationSlots: [] }));
    expect(fixedButton('スケジュール')).toHaveAttribute('aria-pressed', 'true');
  });

  it('adds rotation slots below the fixed ones', async () => {
    await renderLoaded({ ...getDefaultSidePanelSettings(), fixedSlots: ['schedule'], rotationSlots: [] });

    await act(async () => fireEvent.click(rotationButton('本日の戦績')));
    await act(async () => fireEvent.click(rotationButton('本日のお題')));

    await waitFor(() => expect(lastPosted()).toMatchObject({ fixedSlots: ['schedule'], rotationSlots: ['salmon', 'challenges'] }));
  });

  it('does not let a fixed slot be chosen for the rotation', async () => {
    await renderLoaded({ ...getDefaultSidePanelSettings(), fixedSlots: ['schedule'], rotationSlots: ['salmon'] });

    expect(rotationButton('スケジュール')).toBeDisabled();
    expect(rotationButton('本日のお題')).toBeEnabled();
  });

  it('moves a rotating slot to the fixed area', async () => {
    await renderLoaded({ ...getDefaultSidePanelSettings(), fixedSlots: ['schedule'], rotationSlots: ['salmon', 'challenges'] });

    await act(async () => fireEvent.click(fixedButton('本日の戦績')));

    await waitFor(() => expect(lastPosted()).toMatchObject({ fixedSlots: ['schedule', 'salmon'], rotationSlots: ['challenges'] }));
    expect(rotationButton('本日の戦績')).toBeDisabled();
  });

  it('fixes the burndown alone and turns off the rotation', async () => {
    await renderLoaded({ ...getDefaultSidePanelSettings(), fixedSlots: ['salmon'], rotationSlots: ['challenges'] });

    await act(async () => fireEvent.click(fixedButton('バーンダウン')));

    await waitFor(() => expect(lastPosted()).toMatchObject({ fixedSlots: ['burndown'], rotationSlots: [] }));
    expect(rotationButton('本日のお題')).toBeDisabled();
  });

  it('releases a fixed burndown when another slot is fixed', async () => {
    await renderLoaded({ ...getDefaultSidePanelSettings(), fixedSlots: ['burndown'], rotationSlots: [] });

    await act(async () => fireEvent.click(fixedButton('本日のお題')));

    await waitFor(() => expect(lastPosted()).toMatchObject({ fixedSlots: ['challenges'], rotationSlots: [] }));
  });

  it('rotates the burndown below fixed slots', async () => {
    await renderLoaded({ ...getDefaultSidePanelSettings(), fixedSlots: ['schedule'], rotationSlots: [] });

    await act(async () => fireEvent.click(rotationButton('バーンダウン')));

    await waitFor(() => expect(lastPosted()).toMatchObject({ fixedSlots: ['schedule'], rotationSlots: ['burndown'] }));
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

    await waitFor(() => expect(lastPosted()).toMatchObject({ fixedSlots: [], rotationSlots: ['challenges'] }));
  });

  it('warns when the slots may not fit in the panel', async () => {
    await renderLoaded({ ...getDefaultSidePanelSettings(), fixedSlots: ['schedule'], rotationSlots: [] });
    expect(screen.queryByText(/収まらず/)).not.toBeInTheDocument();

    await act(async () => fireEvent.click(fixedButton('本日の戦績')));
    await act(async () => fireEvent.click(rotationButton('バーンダウン')));

    expect(screen.getByText(/収まらず/)).toBeInTheDocument();
  });

  it('saves the rotation seconds only when they are valid', async () => {
    await renderLoaded();
    const input = screen.getByLabelText('切り替えの秒数');

    await act(async () => fireEvent.change(input, { target: { value: '3' } }));
    expect(mockedAxios.post).not.toHaveBeenCalled();
    expect(input).toHaveAttribute('aria-invalid', 'true');

    await act(async () => fireEvent.change(input, { target: { value: '15' } }));
    await waitFor(() => expect(lastPosted()).toMatchObject({ rotateSeconds: 15 }));
  });

  it('reloads the saved settings when saving fails', async () => {
    await renderLoaded();
    mockedAxios.post.mockRejectedValue(new Error('500'));

    await act(async () => fireEvent.click(fixedButton('スケジュール')));

    expect(await screen.findByText('設定の保存に失敗しました。')).toBeInTheDocument();
    await waitFor(() => expect(fixedButton('スケジュール')).toHaveAttribute('aria-pressed', 'false'));
  });

  it('puts the saved seconds back in the field when saving fails', async () => {
    await renderLoaded({ ...getDefaultSidePanelSettings(), rotateSeconds: 8 });
    mockedAxios.post.mockRejectedValue(new Error('500'));

    await act(async () => fireEvent.change(screen.getByLabelText('切り替えの秒数'), { target: { value: '30' } }));

    expect(await screen.findByText('設定の保存に失敗しました。')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('切り替えの秒数')).toHaveValue(8));
  });

  it('shows the saved follower goal', async () => {
    await renderLoaded({ ...getDefaultSidePanelSettings(), followerGoal: 20 });
    expect(screen.getByLabelText('フォロワー目標')).toHaveValue(20);
  });

  it('saves the follower goal, and clears it when the field is emptied', async () => {
    await renderLoaded();
    const input = screen.getByLabelText('フォロワー目標');

    await act(async () => fireEvent.change(input, { target: { value: '20' } }));
    await waitFor(() => expect(lastPosted()).toMatchObject({ followerGoal: 20 }));

    await act(async () => fireEvent.change(input, { target: { value: '' } }));
    await waitFor(() => expect(lastPosted()).toMatchObject({ followerGoal: null }));
  });

  it('does not save an invalid follower goal', async () => {
    await renderLoaded();
    const input = screen.getByLabelText('フォロワー目標');

    await act(async () => fireEvent.change(input, { target: { value: '0' } }));

    expect(mockedAxios.post).not.toHaveBeenCalled();
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('keeps what another screen changed when saving', async () => {
    const challenges = [{ id: 1, text: 'オカシラを倒す', done: false }];
    await renderLoaded({ ...getDefaultSidePanelSettings(), challenges });
    // 配信中の画面でお題を達成にした
    mockedAxios.get.mockResolvedValue({ data: { ...getDefaultSidePanelSettings(), challenges: [{ ...challenges[0], done: true }] }, status: 200 });

    await act(async () => fireEvent.click(fixedButton('スケジュール')));

    await waitFor(() => expect(lastPosted()).toMatchObject({ fixedSlots: ['schedule', 'salmon'], challenges: [{ id: 1, done: true }] }));
  });

  it('shows an error when loading fails', async () => {
    mockedAxios.get.mockRejectedValue(new Error('500'));
    render(<Harness />);

    expect(await screen.findByText(/読み込みに失敗しました/)).toBeInTheDocument();
  });
});
