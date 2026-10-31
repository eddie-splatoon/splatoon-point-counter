import { render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import WeaponCardOverlayPage from './page';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

const card = { startedAt: 0, total: 71, obtained: [{ key: 'sshooter', at: 1, source: 'job' }] };

describe('WeaponCardOverlayPage', () => {
  beforeEach(() => {
    mockedAxios.get.mockReset();
    vi.spyOn(global, 'setInterval').mockImplementation(vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the card with the font of the common settings', async () => {
    mockedAxios.get.mockImplementation(async (url: string) =>
      url === '/api/weapon-card' ? { data: card, status: 200 } : { data: { fontFamily: 'FOT-Kurokane Std' }, status: 200 });
    const { container } = render(<WeaponCardOverlayPage />);

    expect(await screen.findByTestId('weapon-card-progress')).toHaveTextContent('1 / 71');
    await waitFor(() => expect(container.firstChild).toHaveStyle({ fontFamily: 'FOT-Kurokane Std' }));
  });

  it('shows the card even when the font cannot be loaded', async () => {
    mockedAxios.get.mockImplementation(async (url: string) => {
      if (url === '/api/weapon-card') return { data: card, status: 200 };
      throw new Error('500');
    });
    render(<WeaponCardOverlayPage />);

    expect(await screen.findByTestId('weapon-card')).toBeInTheDocument();
  });

  it('shows nothing until the card is loaded', async () => {
    mockedAxios.get.mockRejectedValue(new Error('500'));
    render(<WeaponCardOverlayPage />);

    await waitFor(() => expect(mockedAxios.get).toHaveBeenCalledWith('/api/weapon-card', expect.anything()));
    expect(screen.queryByTestId('weapon-card')).not.toBeInTheDocument();
  });
});
