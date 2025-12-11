import { render, screen, act } from '@testing-library/react';
import { format } from 'date-fns';
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

  const now = Date.now();
  const baseData: BurndownData = {
    label: '残り',
    targetValue: 50000,
    entries: [
        { score: 10000, timestamp: now - 20000 },
        { score: 5000, timestamp: now - 10000 },
    ],
  };

  it('renders initial data correctly', () => {
    render(<BurndownChart data={baseData} />);
    
    expect(screen.getByText('目標: 50,000')).toBeInTheDocument();
    expect(screen.getByText('現在: 15,000')).toBeInTheDocument();
    expect(screen.getByText('残り')).toBeInTheDocument();

    const remainingValue = 50000 - 15000;
    expect(screen.getByText(remainingValue.toLocaleString())).toBeInTheDocument();

    const percentage = Math.round((15000 / 50000) * 100);
    expect(screen.getByText(`${percentage}%`)).toBeInTheDocument();
  });

  it('renders chart with axis labels', () => {
    const dataWithMoreEntries: BurndownData = {
      ...baseData,
      entries: [
        { score: 10000, timestamp: now - 3600000 }, // 1 hour ago
        { score: 5000, timestamp: now - 1800000 },  // 30 mins ago
        { score: 2000, timestamp: now },             // now
      ]
    }
    render(<BurndownChart data={dataWithMoreEntries} />);

    // Y-Axis
    expect(screen.getByText('50k')).toBeInTheDocument();
    expect(screen.queryByText('25k')).not.toBeInTheDocument(); // Intermediate value is removed
    expect(screen.getByText('0k')).toBeInTheDocument();

    // X-Axis (formatted time)
    // We expect 3 time labels.
    const firstTime = format(new Date(dataWithMoreEntries.entries[0].timestamp), 'HH:mm:ss');
    const middleTime = format(new Date(dataWithMoreEntries.entries[0].timestamp + (dataWithMoreEntries.entries[2].timestamp - dataWithMoreEntries.entries[0].timestamp) / 2), 'HH:mm:ss');
    const lastTime = format(new Date(dataWithMoreEntries.entries[2].timestamp), 'HH:mm:ss');

    // Check that these formatted times are present in the document
    expect(screen.getByText(firstTime)).toBeInTheDocument();
    expect(screen.getByText(middleTime)).toBeInTheDocument();
    expect(screen.getByText(lastTime)).toBeInTheDocument();
  });

  it('handles goal reached state (remaining is zero)', () => {
    const goalReachedData: BurndownData = {
      ...baseData,
      entries: [
          { score: 30000, timestamp: now - 1000 },
          { score: 20000, timestamp: now },
      ],
    };
    render(<BurndownChart data={goalReachedData} />);

    expect(screen.getByText('現在: 50,000')).toBeInTheDocument();
    
    const remainingElement = screen.getByText('0');
    expect(remainingElement).toBeInTheDocument();
    expect(remainingElement.className).toContain('text-green-400');
    
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('updates with animation when data changes', () => {
    const { rerender } = render(<BurndownChart data={baseData} />);
    const initialRemaining = 50000 - 15000;
    let remainingElement = screen.getByText(initialRemaining.toLocaleString());
    
    // Check initial state (no animation)
    expect(remainingElement).not.toHaveStyle('transform: scale(1.2)');
    expect(remainingElement).toHaveStyle('opacity: 1');

    // Rerender with new data to trigger animation
    const newData: BurndownData = { ...baseData, entries: [...baseData.entries, { score: 20000, timestamp: now }] };
    rerender(<BurndownChart data={newData} />);
    
    // Check animating state
    remainingElement = screen.getByText(initialRemaining.toLocaleString()); // Still displaying initial value
    expect(remainingElement).toHaveStyle('transform: scale(1.2)');
    expect(remainingElement).toHaveStyle('opacity: 0.7');
    expect(remainingElement).toHaveStyle('color: #FF40A0'); // Check for the pink color

    // Fast-forward time
    act(() => {
      vi.advanceTimersByTime(300); // Duration matches useEffect setTimeout
    });

    // Check final state (new value, no animation)
    const newRemaining = 50000 - 35000;
    const newRemainingElement = screen.getByText(newRemaining.toLocaleString());
    expect(newRemainingElement).not.toHaveStyle('transform: scale(1.2)');
    expect(newRemainingElement).toHaveStyle('opacity: 1');
    expect(newRemainingElement).toHaveStyle('color: rgb(255, 255, 255)'); // Default white color
  });

  it('renders an SVG chart with a path', () => {
    render(<BurndownChart data={baseData} />);
    const svgContainer = screen.getByText('目標: 50,000').closest('.w-full.h-full')?.querySelector('svg');
    expect(svgContainer).toBeInTheDocument();
    const path = svgContainer?.querySelector('path');
    expect(path).toBeInTheDocument();
    expect(path?.getAttribute('d')).not.toBe('M 0,0');
  });
});