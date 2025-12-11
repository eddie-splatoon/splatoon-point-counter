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

    // After re-render, the component shows the *new* value with animation.
    // This is because the prevValueRef is updated before the animation render.
    value = screen.getByText('54321');
    expect(value.className).toContain('scale-125');
    expect(value.className).toContain('text-red-400');

    // Fast-forward time
    act(() => {
      vi.advanceTimersByTime(500);
    });
    
    // Re-query the element
    value = screen.getByText('54321');

    // Now the new value should be displayed, without animation classes
    expect(value.className).not.toContain('scale-125');
  });
});
