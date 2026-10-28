import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import ChallengeList from './ChallengeList';

const challenges = [
  { id: 1, text: 'キケン度MAXでクリア', done: false },
  { id: 2, text: '新ブキで3クリア', done: true },
];

const stamp = (id: number) => screen.queryByTestId(`stamp-${id}`);

describe('ChallengeList', () => {
  it('lists the challenges with the cleared count', () => {
    render(<ChallengeList challenges={challenges} />);

    expect(screen.getByText('本日のお題')).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(screen.getByText('キケン度MAXでクリア')).toBeInTheDocument();
    expect(screen.getByText('新ブキで3クリア')).toBeInTheDocument();
  });

  it('stamps only the cleared challenges', () => {
    render(<ChallengeList challenges={challenges} />);

    expect(stamp(1)).not.toBeInTheDocument();
    expect(stamp(2)).toHaveTextContent('達成');
  });

  it('does not animate stamps for challenges already cleared when shown', () => {
    render(<ChallengeList challenges={challenges} />);
    expect(stamp(2)).toHaveAttribute('data-animated', 'false');
  });

  it('animates the stamp when a challenge is cleared', () => {
    const { rerender } = render(<ChallengeList challenges={challenges} />);

    rerender(<ChallengeList challenges={[{ ...challenges[0], done: true }, challenges[1]]} />);

    expect(stamp(1)).toHaveAttribute('data-animated', 'true');
    expect(stamp(2)).toHaveAttribute('data-animated', 'false');
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });

  it('keeps the stamp still when the same data is polled again', () => {
    const { rerender } = render(<ChallengeList challenges={challenges} />);
    rerender(<ChallengeList challenges={challenges.map((c) => ({ ...c }))} />);

    expect(stamp(2)).toHaveAttribute('data-animated', 'false');
  });

  it('animates again when a challenge is unchecked and cleared again', () => {
    const { rerender } = render(<ChallengeList challenges={challenges} />);

    rerender(<ChallengeList challenges={[challenges[0], { ...challenges[1], done: false }]} />);
    expect(stamp(2)).not.toBeInTheDocument();

    rerender(<ChallengeList challenges={challenges} />);
    expect(stamp(2)).toHaveAttribute('data-animated', 'true');
  });

  it('does not animate a newly added challenge that is already cleared', () => {
    const { rerender } = render(<ChallengeList challenges={challenges} />);

    rerender(<ChallengeList challenges={[...challenges, { id: 3, text: '追加', done: true }]} />);

    expect(stamp(3)).toHaveAttribute('data-animated', 'false');
  });

  it('keeps the line breaks chosen by the streamer', () => {
    render(<ChallengeList challenges={[{ id: 1, text: 'キケン度MAXで\n3連続クリア', done: false }]} />);

    const text = screen.getByText((_, el) => el?.textContent === 'キケン度MAXで\n3連続クリア' && el.tagName === 'SPAN');
    expect(text).toHaveStyle({ whiteSpace: 'pre-line' });
  });

  it('renders nothing without challenges', () => {
    const { container } = render(<ChallengeList challenges={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
