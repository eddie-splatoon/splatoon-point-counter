import { act, fireEvent, render, screen } from '@testing-library/react';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BreakState } from '../lib/breakTypes';
import { getDefaultTelopSettings } from '../lib/telopTypes';

import ControlPanelShell from './ControlPanelShell';

import type { ComponentPropsWithoutRef } from 'react';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);
vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (props: ComponentPropsWithoutRef<'img'>) => <img {...props} alt={props.alt} />,
}));

const idle: BreakState = { active: false, startedAt: null, voiceHeardAt: null, serverTime: 0 };

const respond = (breakState: BreakState) => {
  mockedAxios.get.mockImplementation(async (url: string) => {
    if (url === '/api/telop') return { data: { presets: getDefaultTelopSettings().presets, current: null, revision: 0 }, status: 200 };
    return { data: breakState, status: 200 };
  });
};

const renderShell = async () => {
  render(<ControlPanelShell><p>中身</p></ControlPanelShell>);
  await screen.findByText('中身');
  // プリセットの読み込みと、キーボードのリスナーを登録する effect を流し切る
  await act(async () => {});
};

beforeEach(() => {
  vi.clearAllMocks();
  respond(idle);
  mockedAxios.post.mockResolvedValue({ data: {}, status: 200 });
});

describe('ControlPanelShell', () => {
  it('links the phases and marks the current one', async () => {
    await renderShell();

    const nav = screen.getByRole('navigation', { name: 'フェーズ' });
    expect(nav).toHaveTextContent('準備配信中振り返り');
    // usePathname は /control-panel（vitest.setup.ts のモック）
    expect(screen.getByRole('link', { name: '配信中' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: '準備' })).toHaveAttribute('href', '/control-panel/prepare');
    expect(screen.getByRole('link', { name: '振り返り' })).toHaveAttribute('href', '/control-panel/review');
    expect(screen.getByRole('link', { name: '設定' })).toHaveAttribute('href', '/control-panel/settings');
  });

  it('shows that changes are saved right away', async () => {
    await renderShell();
    expect(screen.getByText('変更はすぐ保存')).toBeInTheDocument();
  });

  it('shows a telop with a number key on any screen', async () => {
    await renderShell();

    await act(async () => fireEvent.keyDown(document.body, { key: '2' }));

    expect(mockedAxios.post).toHaveBeenCalledWith('/api/telop', { presetId: 2 });
  });

  it('puts the break button in the header and the banner below it', async () => {
    respond({ active: true, startedAt: 1_000, voiceHeardAt: null, serverTime: 66_000 });
    vi.spyOn(Date, 'now').mockReturnValue(66_000);
    await renderShell();

    expect(screen.getByRole('button', { name: '休憩を終わる 1:05' })).toBeInTheDocument();
    expect(screen.getByTestId('break-active')).toHaveTextContent('休憩中 1:05');
    expect(screen.getByTestId('break-active')).toHaveTextContent('「ただいま」と話すか、右上のボタンで終わります');
    vi.restoreAllMocks();
  });
});
