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
    
    // Check for copyright text
    expect(screen.getByText(/© 2025 eddie-splatoon/i)).toBeInTheDocument();
  });
});
