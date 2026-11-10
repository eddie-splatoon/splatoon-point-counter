import { render, screen } from '@testing-library/react';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getInitialStreamData } from '../app/api/stream-data/route';

import SalmonReviewOverlay from './SalmonReviewOverlay';

vi.mock('./SalmonReview', () => ({
  default: ({ review, layout }: { review: { totals: { jobs: number } }; layout: string }) => (
    <div data-testid="SalmonReview" data-layout={layout}>{review.totals.jobs} バイト</div>
  ),
}));

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SalmonReviewOverlay', () => {
  it('shows the review of the current session in the stream font', async () => {
    mockedAxios.get.mockImplementation(async (url: string) => {
      if (url === '/api/salmon/review') return { data: { totals: { jobs: 5 } }, status: 200 };
      if (url === '/api/stream-data') return { data: { ...getInitialStreamData(), fontFamily: 'Splatfont' }, status: 200 };
      throw new Error(`unexpected ${url}`);
    });
    const { container } = render(<SalmonReviewOverlay layout="landscape" />);

    expect(await screen.findByTestId('SalmonReview')).toHaveTextContent('5 バイト');
    expect(container.firstChild).toHaveStyle({ fontFamily: 'Splatfont' });
  });

  it('passes the layout for the vertical stream', async () => {
    mockedAxios.get.mockImplementation(async (url: string) => {
      if (url === '/api/salmon/review') return { data: { totals: { jobs: 2 } }, status: 200 };
      throw new Error(`unexpected ${url}`);
    });
    render(<SalmonReviewOverlay layout="portrait" />);

    expect(await screen.findByTestId('SalmonReview')).toHaveAttribute('data-layout', 'portrait');
  });

  it('shows nothing until the review is fetched', async () => {
    mockedAxios.get.mockRejectedValue(new Error('500'));
    render(<SalmonReviewOverlay layout="landscape" />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByTestId('SalmonReview')).not.toBeInTheDocument();
  });
});
