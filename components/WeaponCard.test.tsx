import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SALMON_WEAPONS } from '../lib/salmonWeapons';

import WeaponCard from './WeaponCard';

import type { WeaponCard as WeaponCardData } from '../lib/salmonWeapons';

const cardOf = (keys: string[], startedAt = 1000): WeaponCardData => ({
  startedAt,
  total: SALMON_WEAPONS.length,
  obtained: keys.map((key, i) => ({ key, at: startedAt + i, source: 'job' })),
});

const ALL_KEYS = SALMON_WEAPONS.map((w) => w.key);
const stamp = (key: string) => screen.queryByTestId(`weapon-stamp-${key}`);
const fireworks = () => document.querySelector('.fireworks');

describe('WeaponCard', () => {
  it('shows every weapon with the progress', () => {
    render(<WeaponCard card={cardOf(['sshooter', 'pablo'])} />);

    expect(screen.getByText('オールランダム ブキ埋め')).toBeInTheDocument();
    expect(screen.getByTestId('weapon-card-progress')).toHaveTextContent('2 / 71');
    expect(within(screen.getByTestId('weapon-card')).getAllByRole('listitem')).toHaveLength(71);
    expect(document.querySelector('[data-weapon="sshooter"]')).toHaveAttribute('data-obtained', 'true');
    expect(document.querySelector('[data-weapon="nova"]')).toHaveAttribute('data-obtained', 'false');
  });

  it('does not animate the weapons already filled when shown', () => {
    render(<WeaponCard card={cardOf(['sshooter'])} />);
    expect(stamp('sshooter')).toHaveAttribute('data-animated', 'false');
    expect(stamp('nova')).not.toBeInTheDocument();
  });

  it('animates only a newly filled weapon', () => {
    const { rerender } = render(<WeaponCard card={cardOf(['sshooter'])} />);
    rerender(<WeaponCard card={cardOf(['sshooter', 'nova'])} />);

    expect(stamp('nova')).toHaveAttribute('data-animated', 'true');
    expect(stamp('sshooter')).toHaveAttribute('data-animated', 'false');

    // 同じ内容をもう一度ポーリングしても演出し直さない
    rerender(<WeaponCard card={cardOf(['sshooter', 'nova'])} />);
    expect(stamp('nova')).toHaveAttribute('data-animated', 'true');
  });

  it('does not animate when a new card starts', () => {
    const { rerender } = render(<WeaponCard card={cardOf(['sshooter'])} />);
    rerender(<WeaponCard card={cardOf([], 2000)} />);
    rerender(<WeaponCard card={cardOf(['nova'], 2000)} />);
    expect(stamp('nova')).toHaveAttribute('data-animated', 'true');

    rerender(<WeaponCard card={cardOf(['pablo'], 3000)} />);
    expect(stamp('pablo')).toHaveAttribute('data-animated', 'false');
  });

  it('shows fireworks only when the last weapon is filled', () => {
    const { rerender } = render(<WeaponCard card={cardOf(ALL_KEYS.slice(1))} />);
    expect(fireworks()).not.toBeInTheDocument();

    rerender(<WeaponCard card={cardOf(ALL_KEYS)} />);
    expect(fireworks()).toBeInTheDocument();
    expect(screen.getByTestId('weapon-card-progress')).toHaveTextContent('71 / 71');
  });

  it('does not show fireworks for a card already complete when shown', () => {
    render(<WeaponCard card={cardOf(ALL_KEYS)} />);
    expect(fireworks()).not.toBeInTheDocument();
  });

  it('shows a compact card for the side panel with the same animations', () => {
    const { rerender } = render(<WeaponCard card={cardOf(['sshooter'])} compact />);

    expect(screen.getByTestId('weapon-card')).toHaveAttribute('data-compact', 'true');
    expect(screen.getByText('ブキ埋め')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'スプラシューター' })).toHaveAttribute('width', '15');

    rerender(<WeaponCard card={cardOf(['sshooter', 'nova'])} compact />);
    expect(stamp('nova')).toHaveAttribute('data-animated', 'true');
  });

  it('shows the weapon name when the image cannot be loaded', () => {
    render(<WeaponCard card={cardOf([])} />);
    fireEvent.error(screen.getByRole('img', { name: 'スプラシューター' }));

    expect(screen.queryByRole('img', { name: 'スプラシューター' })).not.toBeInTheDocument();
    expect(within(document.querySelector('[data-weapon="sshooter"]') as HTMLElement).getByText('スプラシューター')).toBeInTheDocument();
  });
});
