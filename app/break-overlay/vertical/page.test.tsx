import { render, screen } from '@testing-library/react';
import axios from 'axios';
import { describe, expect, it, vi } from 'vitest';

import BreakOverlayPage from '../page';

import VerticalBreakOverlayPage from './page';

vi.mock('axios');
vi.mocked(axios).get.mockReturnValue(new Promise(() => {}));

describe('break overlay pages', () => {
  it('uses the landscape layout for /break-overlay', () => {
    render(<BreakOverlayPage />);
    expect(screen.getByTestId('break-area')).toHaveAttribute('data-layout', 'landscape');
  });

  it('uses the portrait layout for /break-overlay/vertical', () => {
    render(<VerticalBreakOverlayPage />);
    expect(screen.getByTestId('break-area')).toHaveAttribute('data-layout', 'portrait');
  });
});
