import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import InkTankGauge from './InkTankGauge';

vi.mock('./BubbleEffect', () => ({
  default: ({ trigger }: { trigger: number | null }) => <div data-testid="BubbleEffect" data-trigger={String(trigger)} />,
}));
vi.mock('./FireworksEffect', () => ({
  default: ({ trigger }: { trigger: boolean }) => <div data-testid="FireworksEffect" data-trigger={String(trigger)} />,
}));

const bubbleTrigger = () => screen.getByTestId('BubbleEffect').getAttribute('data-trigger');
const fireworksTrigger = () => screen.getByTestId('FireworksEffect').getAttribute('data-trigger');
const inkRatio = () => Number(screen.getByTestId('ink-level').getAttribute('data-ratio'));

describe('InkTankGauge', () => {
  it('shows the progress as text and as an ink level', () => {
    render(<InkTankGauge current={10} target={20} lastFollowAt={null} />);

    expect(screen.getByText('フォロワー目標')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('/ 20')).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'フォロワー目標' })).toHaveAttribute('aria-valuenow', '10');
    expect(inkRatio()).toBe(0.5);
  });

  it('caps the ink level at a full tank', () => {
    render(<InkTankGauge current={25} target={20} lastFollowAt={null} />);
    expect(inkRatio()).toBe(1);
  });

  it('does not play the follow effect for a follow that happened before it was shown', () => {
    render(<InkTankGauge current={10} target={20} lastFollowAt={1000} />);
    expect(bubbleTrigger()).toBe('null');
  });

  it('plays the follow effect when a new follow arrives', () => {
    const { rerender } = render(<InkTankGauge current={10} target={20} lastFollowAt={1000} />);

    rerender(<InkTankGauge current={11} target={20} lastFollowAt={2000} />);

    expect(bubbleTrigger()).toBe('2000');
  });

  it('plays the fireworks when the goal is reached while shown', () => {
    const { rerender } = render(<InkTankGauge current={19} target={20} lastFollowAt={null} />);
    expect(fireworksTrigger()).toBe('false');

    rerender(<InkTankGauge current={20} target={20} lastFollowAt={2000} />);

    expect(fireworksTrigger()).toBe('true');
  });

  it('does not play the fireworks for a goal that was already reached when shown', () => {
    render(<InkTankGauge current={20} target={20} lastFollowAt={null} />);
    expect(fireworksTrigger()).toBe('false');
  });

  it('does not play the fireworks when only the goal is lowered', () => {
    const { rerender } = render(<InkTankGauge current={10} target={20} lastFollowAt={null} />);

    rerender(<InkTankGauge current={10} target={10} lastFollowAt={null} />);

    expect(fireworksTrigger()).toBe('false');
  });

  it('plays the fireworks again when a new goal is reached', () => {
    const { rerender } = render(<InkTankGauge current={19} target={20} lastFollowAt={null} />);
    rerender(<InkTankGauge current={20} target={20} lastFollowAt={1} />);
    const first = screen.getByTestId('FireworksEffect');

    rerender(<InkTankGauge current={20} target={30} lastFollowAt={1} />);
    rerender(<InkTankGauge current={30} target={30} lastFollowAt={2} />);

    // 作り直された（別の要素になった）ことで、花火が最初から再生される
    expect(screen.getByTestId('FireworksEffect')).not.toBe(first);
    expect(fireworksTrigger()).toBe('true');
  });
});
