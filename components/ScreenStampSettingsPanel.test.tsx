import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_SCREEN_STAMP_SETTINGS } from '../lib/screenStampTypes';

import ScreenStampSettingsPanel, { ScreenStampHistoryCard } from './ScreenStampSettingsPanel';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

beforeEach(() => {
  vi.clearAllMocks();
  mockedAxios.get.mockImplementation(async (url: string) => {
    if (url === '/api/screen-stamp?view=settings') return { data: DEFAULT_SCREEN_STAMP_SETTINGS, status: 200 };
    return { data: { windows: [] }, status: 200 };
  });
  mockedAxios.put.mockImplementation(async (_url: string, body: unknown) => ({ data: (body as { settings: unknown }).settings, status: 200 }));
});

const lastSaved = () => (mockedAxios.put.mock.calls.at(-1)?.[1] as { settings: typeof DEFAULT_SCREEN_STAMP_SETTINGS }).settings;

describe('ScreenStampSettingsPanel', () => {
  it('saves words and follower emote names when leaving the field', async () => {
    render(<ScreenStampSettingsPanel />);
    const nice = await screen.findByRole('listitem', { name: 'ナイス' });

    const words = within(nice).getByLabelText('言葉（、で区切る）');
    expect(words).toHaveValue('ないす、nice');
    fireEvent.change(words, { target: { value: 'ないす、nice、ないすー' } });
    expect(mockedAxios.put).not.toHaveBeenCalled();
    fireEvent.blur(words);
    await waitFor(() => expect(lastSaved().stamps[0].words).toEqual(['ないす', 'nice', 'ないすー']));

    const emotes = within(nice).getByLabelText('フォロワースタンプの名前（、で区切る）');
    fireEvent.change(emotes, { target: { value: 'eddiesp2Nice' } });
    fireEvent.keyDown(emotes, { key: 'Enter' });
    await waitFor(() => expect(lastSaved().stamps[0].emotes).toEqual(['eddiesp2Nice']));

    // 変わらない保存は送らない
    const count = mockedAxios.put.mock.calls.length;
    fireEvent.blur(emotes);
    expect(mockedAxios.put).toHaveBeenCalledTimes(count);
  });

  it('adds a stamp (saved once it has a label) and deletes one', async () => {
    render(<ScreenStampSettingsPanel />);
    await screen.findByRole('listitem', { name: 'ナイス' });

    fireEvent.click(screen.getByRole('button', { name: 'スタンプを追加' }));
    expect(mockedAxios.put).not.toHaveBeenCalled();
    const added = screen.getByRole('listitem', { name: '新しいスタンプ' });
    const label = within(added).getByLabelText('出す文字');
    fireEvent.change(label, { target: { value: 'たすかる' } });
    fireEvent.blur(label);
    await waitFor(() => expect(lastSaved().stamps.map((s) => s.label)).toEqual(['ナイス', 'ドンマイ', 'カンスト', 'たすかる']));

    fireEvent.click(screen.getByRole('button', { name: 'ドンマイを削除' }));
    await waitFor(() => expect(lastSaved().stamps.map((s) => s.label)).toEqual(['ナイス', 'カンスト', 'たすかる']));
  });

  it('does not save an invalid image URL', async () => {
    render(<ScreenStampSettingsPanel />);
    const nice = await screen.findByRole('listitem', { name: 'ナイス' });
    const image = within(nice).getByLabelText('画像の URL（空なら文字で出す）');
    fireEvent.change(image, { target: { value: 'http://example.com/nice.png' } });
    fireEvent.blur(image);
    expect(await screen.findByText(/保存できない入力があります/)).toBeInTheDocument();
    expect(mockedAxios.put).not.toHaveBeenCalled();
  });

  it('toggles the stamps off', async () => {
    render(<ScreenStampSettingsPanel />);
    fireEvent.click(await screen.findByLabelText('画面スタンプを出す'));
    await waitFor(() => expect(lastSaved().enabled).toBe(false));
  });

  it('still saves other changes while a newly added stamp is left empty', async () => {
    render(<ScreenStampSettingsPanel />);
    await screen.findByRole('listitem', { name: 'ナイス' });
    fireEvent.click(screen.getByRole('button', { name: 'スタンプを追加' }));
    fireEvent.click(screen.getByLabelText('画面スタンプを出す'));
    await waitFor(() => expect(lastSaved()).toEqual({ ...DEFAULT_SCREEN_STAMP_SETTINGS, enabled: false }));
    expect(screen.queryByText(/保存できない入力があります/)).not.toBeInTheDocument();
  });
});

describe('ScreenStampHistoryCard', () => {
  it('shows the counts per stream, most shown first', async () => {
    mockedAxios.get.mockResolvedValue({
      data: {
        windows: [{
          startedAt: new Date(2026, 10, 18, 18, 0).getTime(),
          endedAt: null,
          lastShownAt: new Date(2026, 10, 18, 19, 0).getTime(),
          stamps: [{ id: 'donmai', label: 'ドンマイ', shown: 2, users: 2 }, { id: 'nice', label: 'ナイス', shown: 5, users: 3 }],
        }],
      },
      status: 200,
    });
    render(<ScreenStampHistoryCard />);
    const table = await screen.findByRole('table', { name: '画面スタンプの集計' });
    const rows = within(table).getAllByRole('row').slice(1).map((row) => row.textContent);
    expect(rows[0]).toContain('配信中');
    expect(rows[0]).toContain('ナイス53');
    expect(rows[1]).toBe('ドンマイ22');
  });
});
