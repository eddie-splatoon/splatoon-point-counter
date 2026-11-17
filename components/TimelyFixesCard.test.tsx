import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import TimelyFixesCard from './TimelyFixesCard';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

const score = { scoreLabel: '現在のバイト評価', scoreValue: 'でんせつ 999', autoUpdate: true };
const card = { startedAt: 0, total: 71, obtained: [{ key: 'sshooter', at: 1, source: 'job' }, { key: 'pablo', at: 2, source: 'manual' }] };

beforeEach(() => {
  vi.clearAllMocks();
  mockedAxios.get.mockImplementation(async (url: string) => ({ data: url === '/api/score-display' ? score : card, status: 200 }));
  mockedAxios.patch.mockImplementation(async (url: string, update: unknown) => ({
    data: url === '/api/score-display' ? { ...score, ...(update as object) } : card, status: 200,
  }));
});

describe('TimelyFixesCard', () => {
  it('shows the score display and the weapon card in one line each', async () => {
    render(<TimelyFixesCard />);

    expect(await screen.findByTestId('score-display-value')).toHaveTextContent('でんせつ 999');
    expect(screen.getByText('自動')).toBeInTheDocument();
    expect(await screen.findByTestId('weapon-card-summary')).toHaveTextContent('2 / 71');
    expect(screen.queryByRole('group', { name: 'ブキ埋めカード' })).not.toBeInTheDocument();
  });

  it('fixes the score display in a dialog', async () => {
    render(<TimelyFixesCard />);
    await screen.findByText('でんせつ 999');

    fireEvent.click(screen.getByRole('button', { name: '直す' }));
    const dialog = await screen.findByRole('dialog', { name: /スコア表示を直す/ });
    fireEvent.change(within(dialog).getByLabelText('値'), { target: { value: 'でんせつ 820' } });
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: '反映' })));

    expect(mockedAxios.patch).toHaveBeenCalledWith('/api/score-display', { scoreValue: 'でんせつ 820' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByTestId('score-display-value')).toHaveTextContent('でんせつ 820');
  });

  it('fills and unfills weapons in a dialog', async () => {
    render(<TimelyFixesCard />);
    await screen.findByText('2 / 71');

    fireEvent.click(screen.getByRole('button', { name: '埋める・外す' }));
    const dialog = await screen.findByRole('dialog', { name: /ブキ埋めカードを埋める・外す/ });
    await act(async () => fireEvent.click(within(within(dialog).getByRole('group', { name: 'ブキ埋めカード' })).getByRole('button', { name: 'ノヴァブラスター' })));

    expect(mockedAxios.patch).toHaveBeenCalledWith('/api/weapon-card', { weapon: 'nova', obtained: true });
  });
});
