import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import Home from './page';

const PREVIEWED_PAGES = [
  { label: 'スコア＆メッセージ', href: '/obs-overlay' },
  { label: 'バーンダウンチャート', href: '/burndown-overlay' },
  { label: '字幕', href: '/caption-overlay' },
  { label: 'サイドパネル', href: '/side-panel-overlay' },
  { label: 'サイドパネル 縦型配信用', href: '/side-panel-overlay/vertical' },
  { label: '実況テロップ', href: '/telop-overlay' },
  { label: '実況テロップ 縦型配信用', href: '/telop-overlay/vertical' },
  { label: 'ブキ埋めカード', href: '/weapon-card-overlay' },
  { label: 'サーモンランの振り返り', href: '/salmon-review-overlay' },
  { label: 'サーモンランの振り返り 縦型配信用', href: '/salmon-review-overlay/vertical' },
];

describe('Home Page', () => {
  it('renders the heading, the control panel link and the copyright', () => {
    render(<Home />);

    expect(screen.getByRole('heading', { name: /OBS Overlay Launcher/i })).toBeInTheDocument();

    const controlPanelButton = screen.getByRole('link', { name: /コントロールパネル/i });
    expect(controlPanelButton).toHaveAttribute('href', '/control-panel');
    expect(controlPanelButton).toHaveAttribute('target', '_blank');

    expect(screen.getByText(/© 2025 eddie-splatoon/i)).toBeInTheDocument();
  });

  it.each(PREVIEWED_PAGES)('shows a preview of $href and a link to open it in a new tab', ({ label, href }) => {
    render(<Home />);

    const link = screen.getByRole('link', { name: `${label}を別タブで開く` });
    expect(link).toHaveAttribute('href', href);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');

    expect(screen.getByTitle(`${label}のプレビュー`)).toHaveAttribute('src', `${href}?preview=1`);
  });

  it('links to the voice overlay without embedding it so that the launcher does not play speech', () => {
    render(<Home />);

    const link = screen.getByRole('link', { name: '読み上げ（音声専用）を別タブで開く' });
    expect(link).toHaveAttribute('href', '/voice-overlay');
    expect(link).toHaveAttribute('target', '_blank');

    expect(screen.queryByTitle('読み上げ（音声専用）のプレビュー')).not.toBeInTheDocument();
    expect(document.querySelector('iframe[src^="/voice-overlay"]')).toBeNull();
    expect(screen.getByText('音声のみ（画面表示なし）')).toBeInTheDocument();
  });
});
