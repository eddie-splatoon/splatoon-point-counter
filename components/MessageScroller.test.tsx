import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MessageScroller from './MessageScroller';
import { MessagePreset } from '@/app/api/stream-data/route';

// Mock the motion component to avoid actual animation logic in tests
vi.mock('motion/react', async () => {
    const motion = await vi.importActual('motion/react');
    const React = await vi.importActual('react');
    return {
      ...motion,
      AnimatePresence: ({ children }) => React.createElement('div', null, children),
      motion: {
        ...motion.motion,
        p: React.forwardRef(({ children, ...props }, ref) => React.createElement('p', {...props, ref}, children)),
      },
    };
  });

describe('MessageScroller', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const messages: MessagePreset['messages'] = [
    { id: 1, text: 'First Message' },
    { id: 2, text: 'Second Message' },
    { id: 3, text: 'Third Message' },
  ];

  it('renders the first message initially', () => {
    render(
      <MessageScroller
        messages={messages}
        transitionEffect="fade"
        transitionDuration={3}
        fontSize={24}
      />
    );
    expect(screen.getByText('First Message')).toBeInTheDocument();
  });

  it('does not cycle if there is only one message', () => {
    render(
      <MessageScroller
        messages={[{ id: 1, text: 'Only Message' }]}
        transitionEffect="fade"
        transitionDuration={3}
        fontSize={24}
      />
    );
    
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByText('Only Message')).toBeInTheDocument();
    // The queryByText will not find other messages
    const nonexistentMessage = screen.queryByText('Second Message');
    expect(nonexistentMessage).not.toBeInTheDocument();
  });

  it('cycles to the next message after the specified duration', () => {
    render(
      <MessageScroller
        messages={messages}
        transitionEffect="fade"
        transitionDuration={3}
        fontSize={24}
      />
    );

    expect(screen.getByText('First Message')).toBeInTheDocument();
    
    // Advance time to trigger the interval
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByText('Second Message')).toBeInTheDocument();
    expect(screen.queryByText('First Message')).not.toBeInTheDocument();

    // Advance time again
    act(() => {
        vi.advanceTimersByTime(3000);
    });

    expect(screen.getByText('Third Message')).toBeInTheDocument();
    expect(screen.queryByText('Second Message')).not.toBeInTheDocument();
  });

  it('cycles back to the first message at the end of the list', () => {
    render(
        <MessageScroller
          messages={messages}
          transitionEffect="fade"
          transitionDuration={3}
          fontSize={24}
        />
      );
  
      // Go to last message
      act(() => {
        vi.advanceTimersByTime(3000 * 2);
      });
      expect(screen.getByText('Third Message')).toBeInTheDocument();
  
      // Advance time to cycle back to the start
      act(() => {
        vi.advanceTimersByTime(3000);
      });
  
      expect(screen.getByText('First Message')).toBeInTheDocument();
      expect(screen.queryByText('Third Message')).not.toBeInTheDocument();
  });
});
