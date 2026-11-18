import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getInitialStreamData } from '../app/api/stream-data/route';
import { tokens } from '../app/control-panel/theme';
import { OVERLAY_PAGES } from '../lib/overlayPages';

import ControlPanelSettings from './ControlPanelSettings';
import ControlPanelShell from './ControlPanelShell';

import type { SettingsSectionId } from '../app/control-panel/settings/sections';
import type { ComponentPropsWithoutRef } from 'react';

vi.mock('axios');
const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }), usePathname: () => '/control-panel/settings/telop' }));
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
vi.mock('./ScoreDisplayPanel', () => ({ ScoreAutoUpdateCard: () => <div>ScoreAutoUpdateCard</div> }));

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

const renderSection = (section: SettingsSectionId) =>
  render(<ControlPanelShell><ControlPanelSettings section={section} /></ControlPanelShell>);

describe('ControlPanelSettings', () => {
  it('shows the menu and marks the open section', async () => {
    renderSection('obs');

    const menu = screen.getByRole('navigation', { name: '設定のメニュー' });
    expect(within(menu).getAllByRole('link').map((link) => link.textContent))
      .toEqual(['テロップのプリセット', '読み上げ（VOICEVOX）', '画面スタンプ', 'スコア表示の自動更新', '見た目', 'OBS のブラウザソース']);
    expect(screen.getByRole('link', { name: 'OBS のブラウザソース' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: '見た目' })).toHaveAttribute('href', '/control-panel/settings/appearance');
  });

  it('lists every overlay with its URL and size', async () => {
    renderSection('obs');

    const list = screen.getByRole('list', { name: 'オーバーレイの一覧' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(OVERLAY_PAGES.length);
    OVERLAY_PAGES.forEach((page, i) => {
      expect(rows[i]).toHaveTextContent(page.label);
      expect(rows[i]).toHaveTextContent(`${window.location.origin}${page.href}`);
      expect(rows[i]).toHaveTextContent(page.size ? `${page.size.width}×${page.size.height}` : '音声のみ');
    });
    expect(within(list).getByText(`${window.location.origin}/side-panel-overlay/vertical`)).toBeInTheDocument();
  });

  it('copies the URL of an overlay', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    renderSection('obs');

    await act(async () => fireEvent.click(screen.getByRole('button', { name: '休憩中 の URL をコピー' })));

    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/break-overlay`);
  });

  it('moves to another section with the select on a narrow screen', async () => {
    renderSection('telop');

    fireEvent.change(screen.getByRole('combobox', { name: '設定のメニュー' }), { target: { value: 'voice' } });

    expect(push).toHaveBeenCalledWith('/control-panel/settings/voice');
  });

  it.each([['voice', 'VoiceSettingsPanel'], ['score', 'ScoreAutoUpdateCard']] as const)('shows the %s section', async (section, content) => {
    renderSection(section);
    expect(screen.getByText(content)).toBeInTheDocument();
  });

  it('reloads the telop presets after editing them', async () => {
    renderSection('telop');
    await waitFor(() => expect(telopGets()).toBe(1));

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
    await screen.findByLabelText('フォントサイズ (px)');
    // 狭い幅のメニュー（ネイティブの select）ではなく、MUI のプルダウン
    fireEvent.mouseDown(screen.getAllByRole('combobox').find((box) => box.tagName !== 'SELECT') as HTMLElement);

    // カードと同じ色だと重なって見分けにくいので、1 段上の面（tokens.color.surface2）で表示する
    const menuPaper = (await screen.findByRole('listbox')).closest('.MuiPaper-root');
    expect(menuPaper).toHaveStyle({ backgroundColor: tokens.color.surface2 });
  });
});
