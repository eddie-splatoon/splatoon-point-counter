import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Home from './page';

describe('Home Page', () => {
  it('renders the main heading', () => {
    render(<Home />);
    const heading = screen.getByRole('heading', {
      name: /to get started, edit the page.tsx file./i,
    });
    expect(heading).toBeInTheDocument();
  });
});
