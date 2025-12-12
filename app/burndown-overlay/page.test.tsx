import { render, screen, waitFor, act } from '@testing-library/react';
import axios from 'axios';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { getInitialStreamData, StreamData } from '../api/stream-data/route';

import BurndownOverlayPage from './page';


// Mock child components
vi.mock('../../components/BurndownChart', () => ({
  default: ({ data }) => (
    <div data-testid="BurndownChart">
      <span>{data.label}</span>
      <span data-testid="BurndownChart-remaining">{data.targetValue - data.entries.reduce((sum, entry) => sum + entry.score, 0)}</span>
    </div>
  ),
}));

vi.mock('../../components/FireworksEffect', () => ({
  default: ({ trigger }) => (
    <div data-testid="FireworksEffect" data-trigger={String(trigger)}></div>
  ),
}));


// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios);

describe('BurndownOverlayPage', () => {

    beforeEach(() => {
        vi.useFakeTimers();
        mockedAxios.get.mockClear();
        mockedAxios.post.mockClear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    describe('Rendering and Data Fetching', () => {
        it('shows a loading state initially', () => {
            mockedAxios.get.mockReturnValue(new Promise(() => {})); // Never resolves
            render(<BurndownOverlayPage />);
            expect(screen.getByText('Loading Burndown...')).toBeInTheDocument();
        });
        
        it('shows a loading state if burndown data is missing', async () => {
            const mockData: StreamData = { ...getInitialStreamData(), burndown: undefined as unknown as BurndownData }; // Ensure burndown is undefined
            mockedAxios.get.mockResolvedValue({ data: mockData, status: 200 });

            render(<BurndownOverlayPage />);
            
            await waitFor(() => {
                expect(screen.getByText('Loading Burndown...')).toBeInTheDocument();
            });
            expect(screen.queryByTestId('BurndownChart')).not.toBeInTheDocument();
        });

        it('fetches and displays data correctly', async () => {
            const mockData = getInitialStreamData();
            mockedAxios.get.mockResolvedValue({ data: mockData, status: 200 });

            render(<BurndownOverlayPage />);

            await waitFor(() => {
                expect(screen.queryByText('Loading Burndown...')).not.toBeInTheDocument();
            });
            
            expect(screen.getByTestId('BurndownChart')).toBeInTheDocument();
            expect(screen.getByText(mockData.burndown.label)).toBeInTheDocument();
        });

        it('polls for new data at intervals', async () => {
            const initialData = getInitialStreamData();
            const updatedData = {
                ...initialData,
                burndown: {
                    ...initialData.burndown,
                    entries: [{ score: 1000, timestamp: Date.now() }],
                },
                revision: 1, // Simulate data change
            };

            mockedAxios.get
                .mockResolvedValueOnce({ data: initialData, status: 200 })
                .mockResolvedValueOnce({ data: updatedData, status: 200 });

            render(<BurndownOverlayPage />);

            // Initial fetch
            await waitFor(() => {
                expect(mockedAxios.get).toHaveBeenCalledTimes(1);
                expect(screen.getByTestId('BurndownChart-remaining')).toHaveTextContent(String(initialData.burndown.targetValue));
            });
            
            // Advance timers by POLLING_INTERVAL
            act(() => {
                vi.advanceTimersByTime(2000);
            });

            // Expect second fetch and updated data
            await waitFor(() => {
                expect(mockedAxios.get).toHaveBeenCalledTimes(2);
                expect(screen.getByTestId('BurndownChart-remaining')).toHaveTextContent(String(updatedData.burndown.targetValue - updatedData.burndown.entries[0].score));
            });
        });

        it('triggers FireworksEffect via API when goal is reached', async () => {
            const initialData: StreamData = {
                ...getInitialStreamData(),
                burndown: {
                    ...getInitialStreamData().burndown,
                    entries: [{ score: 100, timestamp: Date.now() }], // Not reached yet
                    targetValue: 200,
                },
                lastEvent: null,
            };
            const goalReachedData: StreamData = {
                ...initialData,
                burndown: {
                    ...initialData.burndown,
                    entries: [{ score: 200, timestamp: Date.now() }], // Goal reached
                },
                revision: 1,
            };

            // Mock get requests for polling
            mockedAxios.get
                .mockResolvedValueOnce({ data: initialData, status: 200 })
                .mockResolvedValueOnce({ data: goalReachedData, status: 200 });
            
            // Mock post requests for triggering fireworks
            mockedAxios.post.mockResolvedValue({ data: {}, status: 200 });

            render(<BurndownOverlayPage />);

            // Initial render, fireworks not active
            await waitFor(() => {
                const fireworks = screen.getByTestId('FireworksEffect');
                expect(fireworks.getAttribute('data-trigger')).toBe('false');
            });

            // Advance timers to trigger poll, goal reached
            act(() => {
                vi.advanceTimersByTime(2000);
            });

            // Expect a POST to trigger fireworks
            await waitFor(() => {
                expect(mockedAxios.post).toHaveBeenCalledTimes(1);
                expect(mockedAxios.post).toHaveBeenCalledWith(
                    '/api/stream-data',
                    expect.objectContaining({
                        lastEvent: expect.objectContaining({ name: 'FIREWORKS' }),
                    })
                );
            });

            // Simulate API response for the POST request, updating lastEvent
            const updatedWithFireworksData = {
                ...goalReachedData,
                lastEvent: { name: 'FIREWORKS', timestamp: Date.now() },
                revision: 2,
            };
            mockedAxios.get.mockResolvedValue({ data: updatedWithFireworksData, status: 200 });

            // Advance timers to next poll, fireworks should be active
            act(() => {
                vi.advanceTimersByTime(2000);
            });

            await waitFor(() => {
                const fireworks = screen.getByTestId('FireworksEffect');
                expect(fireworks.getAttribute('data-trigger')).toBe('true');
            });

            // Advance timers past FIREWORKS_DURATION, fireworks should deactivate
            act(() => {
                vi.advanceTimersByTime(20000 + 2000); // FIREWORKS_DURATION + POLLING_INTERVAL
            });

            // Simulate API response after fireworks duration, with lastEvent potentially cleared or old
            const dataAfterFireworks: StreamData = {
                ...updatedWithFireworksData,
                lastEvent: { name: 'FIREWORKS', timestamp: Date.now() - (20000 + 1) }, // Expired
                revision: 3,
            }
            mockedAxios.get.mockResolvedValue({ data: dataAfterFireworks, status: 200 });

            // Advance timers to next poll, fireworks should be inactive
            act(() => {
                vi.advanceTimersByTime(2000);
            });

            await waitFor(() => {
                const fireworks = screen.getByTestId('FireworksEffect');
                expect(fireworks.getAttribute('data-trigger')).toBe('false');
            });
        });

        it('does not trigger FireworksEffect when goal is not reached', async () => {
            const mockData = getInitialStreamData();
            mockData.burndown.entries = [{ score: 100, timestamp: Date.now() }]; // Not reached
            mockedAxios.get.mockResolvedValue({ data: mockData, status: 200 });

            render(<BurndownOverlayPage />);

            await waitFor(() => {
                expect(screen.getByTestId('FireworksEffect')).toBeInTheDocument();
            });

            const fireworks = screen.getByTestId('FireworksEffect');
            expect(fireworks.getAttribute('data-trigger')).toBe('false');
            expect(mockedAxios.post).not.toHaveBeenCalled(); // No POST should be made
        });
    });
});