import { render, screen } from '@testing-library/react';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getInitialStreamData } from '../api/stream-data/route';

import SalmonReviewOverlayPage from './page';

vi.mock('../../components/SalmonReview', () => ({
  default: ({ review }: { review: { totals: { jobs: number } } }) => <div data-testid="SalmonReview">{review.totals.jobs} バイト</div>,
}));

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SalmonReviewOverlayPage', () => {
  it('shows the review of the current session in the stream font', async () => {
    mockedAxios.get.mockImplementation(async (url: string) => {
      if (url === '/api/salmon/review') return { data: { totals: { jobs: 5 } }, status: 200 };
      if (url === '/api/stream-data') return { data: { ...getInitialStreamData(), fontFamily: 'Splatfont' }, status: 200 };
      throw new Error(`unexpected ${url}`);
    });
    const { container } = render(<SalmonReviewOverlayPage />);

    expect(await screen.findByTestId('SalmonReview')).toHaveTextContent('5 バイト');
    expect(container.firstChild).toHaveStyle({ fontFamily: 'Splatfont' });
  });

  it('shows nothing until the review is fetched', async () => {
    mockedAxios.get.mockRejectedValue(new Error('500'));
    render(<SalmonReviewOverlayPage />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByTestId('SalmonReview')).not.toBeInTheDocument();
  });
});
