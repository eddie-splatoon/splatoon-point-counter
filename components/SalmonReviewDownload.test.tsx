import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import { toBlob } from 'html-to-image';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getInitialStreamData } from '../app/api/stream-data/route';
import { SalmonSessionReview } from '../lib/salmonTypes';
import { downloadBlob } from '../lib/weaponCardImage';

import SalmonReviewDownload, { salmonReviewImageFileName } from './SalmonReviewDownload';

vi.mock('axios');
vi.mock('html-to-image', () => ({ toBlob: vi.fn() }));
vi.mock('../lib/weaponCardImage', () => ({ downloadBlob: vi.fn() }));
vi.mock('./SalmonReview', () => ({
  REVIEW_SIZES: { landscape: { width: 1920, height: 1080 }, portrait: { width: 1080, height: 1920 } },
  default: ({ layout, animate }: { layout: string; animate: boolean }) => (
    <div data-testid="SalmonReview" data-layout={layout} data-animate={String(animate)} />
  ),
}));

const mockedAxios = vi.mocked(axios);

const review = { session: { id: 3, startedAt: new Date(2026, 10, 9, 21).getTime(), title: '' }, totals: { jobs: 2 } } as unknown as SalmonSessionReview;

const mockApi = (fontFamily = 'Splatfont') => {
  mockedAxios.get.mockImplementation(async (url: string) => {
    if (url === '/api/salmon/review') return { data: review, status: 200 };
    if (url === '/api/stream-data') return { data: { ...getInitialStreamData(), fontFamily }, status: 200 };
    throw new Error(`unexpected ${url}`);
  });
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SalmonReviewDownload', () => {
  it('captures the review of the session in the stream font and downloads it', async () => {
    mockApi();
    const blob = new Blob(['png'], { type: 'image/png' });
    let captured: HTMLElement | undefined;
    vi.mocked(toBlob).mockImplementation(async (node) => {
      captured = node;
      return blob;
    });
    render(<SalmonReviewDownload sessionId={3} />);

    fireEvent.click(screen.getByRole('button', { name: '縦長（1080×1920）をダウンロード' }));

    await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(blob, 'salmon-review-20261109-vertical.png'));
    expect(mockedAxios.get).toHaveBeenCalledWith('/api/salmon/review', { params: { sessionId: 3 } });
    expect(vi.mocked(toBlob).mock.calls[0][1]).toMatchObject({ width: 1080, height: 1920, pixelRatio: 1 });
    expect(captured).toHaveStyle({ fontFamily: 'Splatfont' });
    expect(captured?.querySelector('[data-testid="SalmonReview"]')).toHaveAttribute('data-animate', 'false');
    // 撮り終えたら画面外の振り返りを片付ける
    expect(screen.queryByTestId('salmon-review-capture')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /をダウンロード/ })[0]).toBeEnabled();
  });

  it('asks the current session when no session is given', async () => {
    mockApi();
    vi.mocked(toBlob).mockResolvedValue(new Blob(['png']));
    render(<SalmonReviewDownload />);

    fireEvent.click(screen.getByRole('button', { name: '横長（1920×1080）をダウンロード' }));

    await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'salmon-review-20261109.png'));
    expect(mockedAxios.get).toHaveBeenCalledWith('/api/salmon/review', { params: {} });
  });

  it('shows an error when the image cannot be made', async () => {
    mockApi();
    vi.mocked(toBlob).mockRejectedValue(new Error('tainted'));
    render(<SalmonReviewDownload />);

    fireEvent.click(screen.getByRole('button', { name: '横長（1920×1080）をダウンロード' }));

    expect(await screen.findByText('画像を作れませんでした。')).toBeInTheDocument();
    expect(downloadBlob).not.toHaveBeenCalled();
  });

  it('shows an error when the review cannot be loaded', async () => {
    mockedAxios.get.mockRejectedValue(new Error('500'));
    render(<SalmonReviewDownload />);

    fireEvent.click(screen.getByRole('button', { name: '横長（1920×1080）をダウンロード' }));

    expect(await screen.findByText('振り返りを読み込めませんでした。')).toBeInTheDocument();
    expect(toBlob).not.toHaveBeenCalled();
  });
});

describe('salmonReviewImageFileName', () => {
  it('names the image after the start of the session', () => {
    expect(salmonReviewImageFileName(review, 'landscape')).toBe('salmon-review-20261109.png');
    expect(salmonReviewImageFileName(review, 'portrait')).toBe('salmon-review-20261109-vertical.png');
  });

  it('uses today when there is no session', () => {
    expect(salmonReviewImageFileName({ ...review, session: null }, 'landscape', new Date(2026, 0, 2))).toBe('salmon-review-20260102.png');
  });
});
