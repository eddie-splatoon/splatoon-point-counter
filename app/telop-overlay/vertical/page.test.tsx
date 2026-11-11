import { render, screen } from '@testing-library/react';
import axios from 'axios';
import { describe, expect, it, vi } from 'vitest';

import TelopOverlayPage from '../page';

import VerticalTelopOverlayPage from './page';

vi.mock('axios');
vi.mocked(axios).get.mockReturnValue(new Promise(() => {}));

describe('telop overlay pages', () => {
  it('uses the landscape layout for /telop-overlay', () => {
    render(<TelopOverlayPage />);
    expect(screen.getByTestId('telop-overlay')).toHaveAttribute('data-layout', 'landscape');
  });

  it('uses the portrait layout for /telop-overlay/vertical', () => {
    render(<VerticalTelopOverlayPage />);
    expect(screen.getByTestId('telop-overlay')).toHaveAttribute('data-layout', 'portrait');
  });
});
