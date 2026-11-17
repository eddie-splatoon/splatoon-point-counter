import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getInitialStreamData } from '../app/api/stream-data/route';
import { tokens } from '../app/control-panel/theme';

import ControlPanelSettings from './ControlPanelSettings';
import ControlPanelShell from './ControlPanelShell';

import type { ComponentPropsWithoutRef } from 'react';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);
vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (props: ComponentPropsWithoutRef<'img'>) => <img {...props} alt={props.alt} />,
}));
// プリセットの編集と読み上げの設定は、それぞれのテストで確かめる
vi.mock('./TelopPanel', () => ({
  default: ({ onPresetsChange }: { onPresetsChange: () => void }) => <button onClick={onPresetsChange}>プリセットを編集</button>,
}));
vi.mock('./VoiceSettingsPanel', () => ({ default: () => <div>VoiceSettingsPanel</div> }));

const telopGets = () => mockedAxios.get.mock.calls.filter(([url]) => url === '/api/telop').length;

beforeEach(() => {
  vi.clearAllMocks();
  mockedAxios.get.mockImplementation(async (url: string) => {
    if (url === '/api/stream-data') return { data: getInitialStreamData(), status: 200 };
    if (url === '/api/telop') return { data: { presets: [], current: null, revision: 0 }, status: 200 };
    return { data: { active: false, startedAt: null, voiceHeardAt: null, serverTime: 0 }, status: 200 };
  });
  mockedAxios.post.mockResolvedValue({ data: {}, status: 200 });
});

const renderSection = (section: 'telop' | 'appearance' | 'obs') =>
  render(<ControlPanelShell><ControlPanelSettings section={section} /></ControlPanelShell>);

describe('ControlPanelSettings', () => {
  it('shows the menu and marks the open section', async () => {
    renderSection('obs');

    const menu = screen.getByRole('navigation', { name: '設定のメニュー' });
    expect(menu).toHaveTextContent('テロップと読み上げ見た目OBS のブラウザソース');
    expect(screen.getByRole('link', { name: 'OBS のブラウザソース' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: '見た目' })).toHaveAttribute('href', '/control-panel/settings/appearance');
    expect(await screen.findByText(/obs-overlay/)).toBeInTheDocument();
  });

  it('reloads the telop presets after editing them', async () => {
    renderSection('telop');
    await waitFor(() => expect(telopGets()).toBe(1));
    expect(screen.getByText('VoiceSettingsPanel')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'プリセットを編集' }));

    // 配信中の画面のボタンと数字キーに、編集したプリセットを使わせる
    await waitFor(() => expect(telopGets()).toBe(2));
  });

  it('saves the appearance and does not send a value typed halfway', async () => {
    renderSection('appearance');
    const fontSize = await screen.findByLabelText('フォントサイズ (px)');

    // 数字の欄を空にすると 0 になる。フォントサイズとしては不正なので送らず、欄に出す
    fireEvent.change(fontSize, { target: { value: '' } });
    expect(screen.getByText(/この値は保存されません/)).toBeInTheDocument();
    await act(() => new Promise((resolve) => setTimeout(resolve, 800)));
    expect(mockedAxios.post).not.toHaveBeenCalled();

    fireEvent.change(fontSize, { target: { value: '60' } });
    await waitFor(() => expect(mockedAxios.post).toHaveBeenCalledWith('/api/stream-data', { fontSize: 60 }));
  });

  it('shows dropdown menus on a raised surface', async () => {
    renderSection('appearance');
    fireEvent.mouseDown(await screen.findByRole('combobox'));

    // カードと同じ色だと重なって見分けにくいので、1 段上の面（tokens.color.surface2）で表示する
    const menuPaper = (await screen.findByRole('listbox')).closest('.MuiPaper-root');
    expect(menuPaper).toHaveStyle({ backgroundColor: tokens.color.surface2 });
  });
});
