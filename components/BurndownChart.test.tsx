import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { BurndownData } from '@/app/api/stream-data/route';

import BurndownChart from './BurndownChart';

describe('BurndownChart', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const baseData: BurndownData = {
    label: '残り',
    targetValue: 50000,
    entries: [10000, 5000],
  };

  it('renders initial data correctly', () => {
    render(<BurndownChart data={baseData} />);
    
    // Check labels and static values
    expect(screen.getByText('目標: 50,000')).toBeInTheDocument();
    expect(screen.getByText('現在: 15,000')).toBeInTheDocument();
    expect(screen.getByText('残り')).toBeInTheDocument();

    // Check calculated remaining value
    const remainingValue = 50000 - 15000;
    expect(screen.getByText(remainingValue.toLocaleString())).toBeInTheDocument();

    // Check percentage
    const percentage = Math.round((15000 / 50000) * 100);
    expect(screen.getByText(`${percentage}%`)).toBeInTheDocument();
  });

  it('handles goal reached state (remaining is zero)', () => {
    const goalReachedData: BurndownData = {
      ...baseData,
      entries: [30000, 20000],
    };
    render(<BurndownChart data={goalReachedData} />);

    expect(screen.getByText('現在: 50,000')).toBeInTheDocument();
    
    const remainingElement = screen.getByText('0');
    expect(remainingElement).toBeInTheDocument();
    expect(remainingElement.className).toContain('text-green-400');
    
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('handles goal exceeded state (remaining is negative, displays as zero)', () => {
    const goalExceededData: BurndownData = {
      ...baseData,
      entries: [40000, 20000],
    };
    render(<BurndownChart data={goalExceededData} />);

    expect(screen.getByText('現在: 60,000')).toBeInTheDocument();
    
    const remainingElement = screen.getByText('0');
    expect(remainingElement).toBeInTheDocument();
    expect(remainingElement.className).toContain('text-green-400');
    
    // Percentage should be capped at 100
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('updates with animation when data changes', () => {
    const { rerender } = render(<BurndownChart data={baseData} />);
    const initialRemaining = 50000 - 15000;
    let remainingElement = screen.getByText(initialRemaining.toLocaleString());
    expect(remainingElement.className).not.toContain('scale-125');

    // Rerender with new data
    const newData: BurndownData = { ...baseData, entries: [...baseData.entries, 20000] };
    rerender(<BurndownChart data={newData} />);
    
    // The OLD remaining value should be shown with animation
    remainingElement = screen.getByText(initialRemaining.toLocaleString());
    expect(remainingElement.className).toContain('scale-125');

    // Fast-forward time
    act(() => {
      vi.advanceTimersByTime(500);
    });

    // The NEW value is now displayed, without animation
    const newRemaining = 50000 - 35000;
    const newRemainingElement = screen.getByText(newRemaining.toLocaleString());
    expect(newRemainingElement.className).not.toContain('scale-125');
    expect(screen.queryByText(initialRemaining.toLocaleString())).not.toBeInTheDocument();
  });

  it('renders an SVG chart with a path', () => {
    render(<BurndownChart data={baseData} />);
    // SVGs do not have an implicit ARIA role, so we get it by the container.
    const svgContainer = screen.getByText('目標: 50,000').closest('.w-full.h-full')?.querySelector('svg');
    expect(svgContainer).toBeInTheDocument();
    const path = svgContainer?.querySelector('path');
    expect(path).toBeInTheDocument();
    expect(path?.getAttribute('d')).not.toBe('M 0,0');
    expect(path?.getAttribute('d')?.startsWith('M 0,0 L')).toBe(true);
  });
});
