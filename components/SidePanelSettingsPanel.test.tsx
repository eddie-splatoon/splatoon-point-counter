import { act, fireEvent, render, screen } from '@testing-library/react';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getDefaultSidePanelSettings } from '../lib/sidePanelTypes';

import SidePanelSettingsPanel from './SidePanelSettingsPanel';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

const renderLoaded = async (settings = getDefaultSidePanelSettings()) => {
  mockedAxios.get.mockResolvedValue({ data: settings, status: 200 });
  render(<SidePanelSettingsPanel />);
  await screen.findByText('🧩 表示するスロット');
};

const lastPosted = () => mockedAxios.post.mock.calls.at(-1)?.[1];

beforeEach(() => {
  vi.clearAllMocks();
  mockedAxios.post.mockResolvedValue({ data: {}, status: 200 });
});

describe('SidePanelSettingsPanel', () => {
  it('shows the saved settings', async () => {
    await renderLoaded({ ...getDefaultSidePanelSettings(), activeSlot: 'burndown', rotateSeconds: 45 });

    expect(screen.getByRole('button', { name: 'バーンダウン' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('切り替え秒数')).toHaveValue(45);
  });

  it('saves the selected slot immediately', async () => {
    await renderLoaded();

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'バーンダウン' })));

    expect(mockedAxios.post).toHaveBeenCalledWith('/api/side-panel', expect.objectContaining({ activeSlot: 'burndown' }));
    expect(screen.getByRole('button', { name: 'バーンダウン' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('turns on auto rotation and disables the manual slot choice', async () => {
    await renderLoaded();

    await act(async () => fireEvent.click(screen.getByRole('switch', { name: '一定時間ごとに切り替える' })));

    expect(lastPosted()).toMatchObject({ autoRotate: true });
    expect(screen.getByRole('button', { name: 'バーンダウン' })).toBeDisabled();
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

  it('keeps at least one slot in the rotation', async () => {
    await renderLoaded();
    const salmon = screen.getByRole('checkbox', { name: 'サーモンラン' });

    await act(async () => fireEvent.click(salmon));
    expect(lastPosted()).toMatchObject({ enabledSlots: ['burndown'] });

    expect(screen.getByRole('checkbox', { name: 'バーンダウン' })).toBeDisabled();
  });

  it('reloads the saved settings when saving fails', async () => {
    await renderLoaded();
    mockedAxios.post.mockRejectedValue(new Error('500'));

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'バーンダウン' })));

    expect(screen.getByText('設定の保存に失敗しました。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'サーモンラン' })).toHaveAttribute('aria-pressed', 'true');
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

  it('shows an error when loading fails', async () => {
    mockedAxios.get.mockRejectedValue(new Error('500'));
    render(<SidePanelSettingsPanel />);

    expect(await screen.findByText(/読み込みに失敗しました/)).toBeInTheDocument();
  });
});
