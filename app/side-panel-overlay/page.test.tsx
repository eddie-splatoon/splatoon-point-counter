import { act, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getDefaultSidePanelSettings, SidePanelSettings } from '../../lib/sidePanelTypes';
import { getInitialStreamData } from '../api/stream-data/route';

import SidePanelOverlayPage from './page';

vi.mock('../../components/SalmonStats', () => ({
  default: ({ totals }: { totals: { goldenEggs: number } }) => <div data-testid="SalmonStats">金イクラ {totals.goldenEggs}</div>,
}));
vi.mock('../../components/BurndownChart', () => ({
  default: ({ data }: { data: { label: string } }) => <div data-testid="BurndownChart">{data.label}</div>,
}));

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

const salmonSummary = {
  session: { id: 1, startedAt: 0, title: '' },
  lastJob: null,
  totals: { jobs: 1, goldenEggs: 123, bossKills: 0, deaths: 0, clears: 1, failures: 0 },
  jobs: [],
};

const mockApis = (settings: SidePanelSettings, failing: string[] = []) => {
  mockedAxios.get.mockImplementation(async (url: string) => {
    if (failing.includes(url)) throw new Error('500');
    if (url === '/api/side-panel') return { data: settings, status: 200 };
    if (url === '/api/salmon') return { data: salmonSummary, status: 200 };
    if (url === '/api/stream-data') return { data: getInitialStreamData(), status: 200 };
    throw new Error(`unexpected ${url}`);
  });
};

const visibleSlot = () => screen.getByTestId('side-panel-slot').querySelector('[data-slot]:last-child')?.getAttribute('data-slot');

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SidePanelOverlayPage', () => {
  it('renders an empty panel until the settings are loaded', () => {
    mockedAxios.get.mockReturnValue(new Promise(() => {}));
    const { container } = render(<SidePanelOverlayPage />);
    expect(container.firstChild).toBeEmptyDOMElement();
  });

  it('shows the salmon slot by default', async () => {
    mockApis(getDefaultSidePanelSettings());
    render(<SidePanelOverlayPage />);

    expect(await screen.findByTestId('SalmonStats')).toHaveTextContent('金イクラ 123');
    expect(screen.queryByTestId('BurndownChart')).not.toBeInTheDocument();
  });

  it('shows the burndown slot when it is selected', async () => {
    mockApis({ ...getDefaultSidePanelSettings(), activeSlot: 'burndown' });
    render(<SidePanelOverlayPage />);

    expect(await screen.findByTestId('BurndownChart')).toHaveTextContent(getInitialStreamData().burndown.label);
  });

  it('switches slots when the setting changes', async () => {
    mockApis(getDefaultSidePanelSettings());
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<SidePanelOverlayPage />);
    await screen.findByTestId('SalmonStats');

    mockApis({ ...getDefaultSidePanelSettings(), activeSlot: 'burndown' });
    await act(async () => vi.advanceTimersByTime(2000));

    expect(await screen.findByTestId('BurndownChart')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId('SalmonStats')).not.toBeInTheDocument());
  });

  it('rotates through the enabled slots', async () => {
    mockApis({ ...getDefaultSidePanelSettings(), autoRotate: true, rotateSeconds: 10 });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<SidePanelOverlayPage />);
    await screen.findByTestId('SalmonStats');
    expect(visibleSlot()).toBe('salmon');

    await act(async () => vi.advanceTimersByTime(10_000));
    await waitFor(() => expect(visibleSlot()).toBe('burndown'));

    await act(async () => vi.advanceTimersByTime(10_000));
    await waitFor(() => expect(visibleSlot()).toBe('salmon'));
  });

  it('restarts the rotation from the first slot when auto rotation is turned back on', async () => {
    const rotating = { ...getDefaultSidePanelSettings(), autoRotate: true, rotateSeconds: 10 };
    mockApis(rotating);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<SidePanelOverlayPage />);
    await screen.findByTestId('SalmonStats');
    await act(async () => vi.advanceTimersByTime(10_000));
    await waitFor(() => expect(visibleSlot()).toBe('burndown'));

    mockApis({ ...rotating, autoRotate: false, activeSlot: 'burndown' });
    await act(async () => vi.advanceTimersByTime(2000));
    mockApis(rotating);
    await act(async () => vi.advanceTimersByTime(2000));

    await waitFor(() => expect(visibleSlot()).toBe('salmon'));
  });

  it('restarts the rotation when the enabled slots change', async () => {
    const rotating = { ...getDefaultSidePanelSettings(), autoRotate: true, rotateSeconds: 10 };
    mockApis(rotating);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<SidePanelOverlayPage />);
    await screen.findByTestId('SalmonStats');
    await act(async () => vi.advanceTimersByTime(10_000));
    await waitFor(() => expect(visibleSlot()).toBe('burndown'));

    mockApis({ ...rotating, enabledSlots: ['burndown'] });
    await act(async () => vi.advanceTimersByTime(2000));
    await waitFor(() => expect(visibleSlot()).toBe('burndown'));

    // 1スロットだけなら、周期が来ても同じスロットのまま
    await act(async () => vi.advanceTimersByTime(10_000));
    expect(visibleSlot()).toBe('burndown');
  });

  it('keeps the last settings when fetching them fails', async () => {
    mockApis({ ...getDefaultSidePanelSettings(), activeSlot: 'burndown' });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<SidePanelOverlayPage />);
    await screen.findByTestId('BurndownChart');

    mockApis(getDefaultSidePanelSettings(), ['/api/side-panel']);
    await act(async () => vi.advanceTimersByTime(2000));

    expect(visibleSlot()).toBe('burndown');
  });

  it('keeps showing a slot when another API fails', async () => {
    mockApis(getDefaultSidePanelSettings(), ['/api/stream-data']);
    render(<SidePanelOverlayPage />);

    expect(await screen.findByTestId('SalmonStats')).toBeInTheDocument();
  });
});
