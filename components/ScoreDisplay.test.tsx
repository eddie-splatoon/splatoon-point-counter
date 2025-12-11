import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import ScoreDisplay from './ScoreDisplay';

describe('ScoreDisplay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const defaultProps = {
    scoreLabel: 'Current Score',
    scoreValue: '12345',
    fontSize: 60,
  };

  it('renders the label and initial value correctly', () => {
    render(<ScoreDisplay {...defaultProps} />);

    const label = screen.getByText('Current Score');
    const value = screen.getByText('12345');

    expect(label).toBeInTheDocument();
    expect(value).toBeInTheDocument();
  });

  it('applies the correct font sizes based on props', () => {
    render(<ScoreDisplay {...defaultProps} />);

    const label = screen.getByText('Current Score');
    const value = screen.getByText('12345');

    expect(label.style.fontSize).toBe(`${60 * 0.6}px`);
    expect(value.style.fontSize).toBe('60px');
  });

  it('shows animation and updates value when scoreValue prop changes', () => {
    const { rerender } = render(<ScoreDisplay {...defaultProps} />);
    
    // Initial state: no animation
    let value = screen.getByText('12345');
    expect(value.className).not.toContain('scale-125');

    // Rerender with new value
    rerender(<ScoreDisplay {...defaultProps} scoreValue="54321" />);

    // Now, the OLD value should be shown, but with animation classes
    value = screen.getByText('12345');
    expect(value.className).toContain('scale-125');
    expect(value.className).toContain('text-red-400');

    // Fast-forward time
    act(() => {
      vi.advanceTimersByTime(500);
    });
    
    // After the timeout, the NEW value is rendered, without animation
    const newValue = screen.getByText('54321');
    expect(newValue.className).not.toContain('scale-125');
    // The old value should be gone
    expect(screen.queryByText('12345')).not.toBeInTheDocument();
  });
});
