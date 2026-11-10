import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import SalmonReviewOverlayPage from './page';
import VerticalSalmonReviewOverlayPage from './vertical/page';

vi.mock('../../components/SalmonReviewOverlay', () => ({
  default: ({ layout }: { layout: string }) => <div data-testid="SalmonReviewOverlay" data-layout={layout} />,
}));

describe('salmon review overlay pages', () => {
  it('shows the landscape review for the stream', () => {
    render(<SalmonReviewOverlayPage />);
    expect(screen.getByTestId('SalmonReviewOverlay')).toHaveAttribute('data-layout', 'landscape');
  });

  it('shows the portrait review for the vertical stream', () => {
    render(<VerticalSalmonReviewOverlayPage />);
    expect(screen.getByTestId('SalmonReviewOverlay')).toHaveAttribute('data-layout', 'portrait');
  });
});
