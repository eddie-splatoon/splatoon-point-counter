import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import WeaponCardPanel from './WeaponCardPanel';

import type { WeaponCard } from '../lib/salmonWeapons';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

const card = (obtained: WeaponCard['obtained'] = [], startedAt = 0): WeaponCard => ({ startedAt, total: 71, obtained });

const picker = () => screen.getByRole('group', { name: 'ブキ埋めカード' });

beforeEach(() => {
  vi.clearAllMocks();
  mockedAxios.get.mockResolvedValue({
    data: card([{ key: 'sshooter', at: 1, source: 'job' }, { key: 'pablo', at: 2, source: 'manual' }]),
    status: 200,
  });
});

describe('WeaponCardPanel', () => {
  it('shows the progress and the filled weapons', async () => {
    render(<WeaponCardPanel />);

    expect(await screen.findByTestId('weapon-card-count')).toHaveTextContent('2 / 71');
    expect(within(picker()).getByRole('button', { name: 'パブロ' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(picker()).getByRole('button', { name: 'ノヴァブラスター' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('does not let a weapon filled by a record be unfilled manually', async () => {
    render(<WeaponCardPanel />);
    await screen.findByTestId('weapon-card-count');

    expect(within(picker()).getByRole('button', { name: 'スプラシューター' })).toBeDisabled();
  });

  it('fills and unfills weapons manually', async () => {
    mockedAxios.patch.mockResolvedValue({ data: card([{ key: 'sshooter', at: 1, source: 'job' }]), status: 200 });
    render(<WeaponCardPanel />);
    await screen.findByTestId('weapon-card-count');

    await act(async () => fireEvent.click(within(picker()).getByRole('button', { name: 'パブロ' })));
    expect(mockedAxios.patch).toHaveBeenCalledWith('/api/weapon-card', { weapon: 'pablo', obtained: false });
    expect(screen.getByTestId('weapon-card-count')).toHaveTextContent('1 / 71');

    await act(async () => fireEvent.click(within(picker()).getByRole('button', { name: 'ノヴァブラスター' })));
    expect(mockedAxios.patch).toHaveBeenLastCalledWith('/api/weapon-card', { weapon: 'nova', obtained: true });
  });

  it('starts a new card after confirming', async () => {
    mockedAxios.post.mockResolvedValue({ data: card([], new Date('2026-10-31T21:00:00').getTime()), status: 200 });
    render(<WeaponCardPanel />);
    await screen.findByTestId('weapon-card-count');

    fireEvent.click(screen.getByRole('button', { name: '新しいカードを始める' }));
    fireEvent.click(screen.getByRole('button', { name: 'やめる' }));
    // ダイアログが閉じきるまでは、後ろの画面が支援技術から隠れている
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mockedAxios.post).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '新しいカードを始める' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '始める' })));

    expect(mockedAxios.post).toHaveBeenCalledWith('/api/weapon-card', {});
    expect(screen.getByTestId('weapon-card-count')).toHaveTextContent('0 / 71');
    expect(screen.getByText(/今のカードは 10\/31 21:00 から埋めています/)).toBeInTheDocument();
  });

  it('shows an error when saving fails', async () => {
    mockedAxios.patch.mockRejectedValue(new Error('500'));
    render(<WeaponCardPanel />);
    await screen.findByTestId('weapon-card-count');

    await act(async () => fireEvent.click(within(picker()).getByRole('button', { name: 'ノヴァブラスター' })));
    expect(screen.getByText('保存に失敗しました。')).toBeInTheDocument();
  });

  it('shows an error when loading fails', async () => {
    mockedAxios.get.mockRejectedValue(new Error('500'));
    render(<WeaponCardPanel />);
    expect(await screen.findByText(/ブキ埋めカードの読み込みに失敗しました/)).toBeInTheDocument();
  });
});
