import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import Home from './page';

describe('Home Page', () => {
  it('renders the main heading and navigation buttons', () => {
    render(<Home />);
    
    // Check for the main heading
    const heading = screen.getByRole('heading', {
      name: /OBS Overlay Launcher/i,
    });
    expect(heading).toBeInTheDocument();

    // Check for Control Panel button
    const controlPanelButton = screen.getByRole('link', { name: /コントロールパネル/i });
    expect(controlPanelButton).toBeInTheDocument();
    expect(controlPanelButton).toHaveAttribute('href', '/control-panel');
    expect(controlPanelButton).toHaveAttribute('target', '_blank');

    // Check for Score & Message Overlay button
    const scoreOverlayButton = screen.getByRole('link', { name: /スコア＆メッセージオーバーレイ \(Preview\)/i });
    expect(scoreOverlayButton).toBeInTheDocument();
    expect(scoreOverlayButton).toHaveAttribute('href', '/obs-overlay');
    expect(scoreOverlayButton).toHaveAttribute('target', '_blank');

    // Check for Burndown Chart Overlay button
    const burndownOverlayButton = screen.getByRole('link', { name: /バーンダウンチャートオーバーレイ \(Preview\)/i });
    expect(burndownOverlayButton).toBeInTheDocument();
    expect(burndownOverlayButton).toHaveAttribute('href', '/burndown-overlay');
    expect(burndownOverlayButton).toHaveAttribute('target', '_blank');

    // Check for Caption Overlay button
    const captionOverlayButton = screen.getByRole('link', { name: /字幕オーバーレイ \(Preview\)/i });
    expect(captionOverlayButton).toBeInTheDocument();
    expect(captionOverlayButton).toHaveAttribute('href', '/caption-overlay');
    expect(captionOverlayButton).toHaveAttribute('target', '_blank');

    // Check for Side Panel Overlay button
    const sidePanelOverlayButton = screen.getByRole('link', { name: /サイドパネルオーバーレイ \(Preview\)/i });
    expect(sidePanelOverlayButton).toHaveAttribute('href', '/side-panel-overlay');
    expect(sidePanelOverlayButton).toHaveAttribute('target', '_blank');

    // Check for Telop Overlay button
    const telopOverlayButton = screen.getByRole('link', { name: /実況テロップオーバーレイ \(Preview\)/i });
    expect(telopOverlayButton).toHaveAttribute('href', '/telop-overlay');
    expect(telopOverlayButton).toHaveAttribute('target', '_blank');

    // Check for copyright text
    expect(screen.getByText(/© 2025 eddie-splatoon/i)).toBeInTheDocument();
  });
});
