import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react';
import axios from 'axios';
import { describe, it, expect, vi, beforeEach, afterAll, beforeAll } from 'vitest';

import { getInitialStreamData, StreamData } from '../api/stream-data/route';

import ControlPanelPage from './page';


// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios);

// Mock SpeechRecognition
class MockSpeechRecognition {
    start = vi.fn();
    stop = vi.fn();
    onstart = vi.fn();
    onresult = vi.fn();
    onerror = vi.fn();
    onend = vi.fn();
    continuous = false;
    lang = '';
    interimResults = false;
}
// @ts-expect-error: SpeechRecognition is a browser-specific API not available in JSDOM.
window.SpeechRecognition = MockSpeechRecognition;
// @ts-expect-error: SpeechRecognition is a browser-specific API not available in JSDOM.
window.webkitSpeechRecognition = MockSpeechRecognition;


// Mock next/image
vi.mock('next/image', () => ({
    default: (props) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img {...props} alt={props.alt} />
    )
}));

// Mock window.location.reload
const originalLocation = window.location;
beforeAll(() => {
    // @ts-expect-error: Cannot assign to 'location' because it is a read-only property in JSDOM.
    delete window.location;
    window.location = { ...originalLocation, reload: vi.fn() };
});
afterAll(() => {
    window.location = originalLocation;
});


describe('ControlPanelPage', () => {
    let mockData: StreamData;

    beforeEach(() => {
        mockData = getInitialStreamData();
        mockedAxios.get.mockResolvedValue({ data: mockData, status: 200 });
        mockedAxios.post.mockResolvedValue({ data: {}, status: 200 });
        localStorage.clear();
        vi.clearAllMocks();
    });

    it('fetches and displays initial data when no local storage data exists', async () => {
        render(<ControlPanelPage />);
        await waitFor(() => {
            expect(mockedAxios.get).toHaveBeenCalledWith('/api/stream-data');
            expect(screen.getByLabelText('フィールド名')).toHaveValue(mockData.scoreLabel);
            expect(screen.getByLabelText('値')).toHaveValue(mockData.scoreValue);
        });
    });
    
    it('allows switching between tabs', async () => {
        render(<ControlPanelPage />);
        await waitFor(() => expect(screen.getByText('スコア設定')).toBeInTheDocument());

        fireEvent.click(screen.getByRole('tab', { name: 'バーンダウン' }));
        await waitFor(() => expect(screen.getByText('バーンダウンチャート設定')).toBeInTheDocument());

        fireEvent.click(screen.getByRole('tab', { name: 'メッセージ' }));
        await waitFor(() => expect(screen.getByText('視聴者向け概要メッセージ')).toBeInTheDocument());
    });

    it('updates score fields and sends correct payload on submit', async () => {
        render(<ControlPanelPage />);
        await waitFor(() => expect(screen.getByLabelText('値')).toHaveValue(mockData.scoreValue));

        const scoreLabelInput = screen.getByLabelText('フィールド名');
        const scoreValueInput = screen.getByLabelText('値');

        await act(async () => {
            fireEvent.change(scoreLabelInput, { target: { value: 'New Score' } });
            fireEvent.change(scoreValueInput, { target: { value: '9999' } });
            fireEvent.click(screen.getByRole('button', { name: /OBSに反映/ }));
        });
        
        await waitFor(() => {
            expect(mockedAxios.post).toHaveBeenCalledWith('/api/stream-data', 
                expect.objectContaining({
                    scoreLabel: 'New Score',
                    scoreValue: '9999',
                })
            );
        });
    });

    it('adds and removes a burndown entry', async () => {
        render(<ControlPanelPage />);
        await waitFor(() => expect(screen.getByText('スコア設定')).toBeInTheDocument());

        fireEvent.click(screen.getByRole('tab', { name: 'バーンダウン' }));
        await waitFor(() => expect(screen.getByText('バーンダウンチャート設定')).toBeInTheDocument());
        
        const newScoreInput = screen.getByLabelText('新しいポイント');
        const addButton = screen.getByRole('button', { name: '追加' });

        await act(async () => {
            fireEvent.change(newScoreInput, { target: { value: '150' } });
            fireEvent.click(addButton);
        });

        await waitFor(() => {
            const historyContainer = screen.getByTestId('burndown-history');
            expect(within(historyContainer).getByText((content, element) => {
                return content.includes('150');
            })).toBeInTheDocument();
        });

        const removeButton = screen.getByRole('button', { name: /remove entry 150/i }); // Use more specific name
        await act(async () => {
            fireEvent.click(removeButton);
        });
        
        await waitFor(() => {
            const historyContainer = screen.getByTestId('burndown-history');
            expect(within(historyContainer).queryByText((content, element) => {
                return content.includes('150');
            })).not.toBeInTheDocument();
        });
    });

    describe('Local Storage Persistence', () => {
        const localStorageKey = 'control-panel-state';
        const mockFormData = {
            scoreLabel: 'Local Score',
            scoreValue: '12345',
            burndown: {
                label: 'Local Burndown',
                targetValue: 100,
                entries: [{ score: 50, timestamp: Date.now() }],
            },
            fontFamily: 'Arial',
            fontSize: 20,
            transitionEffect: 'slide',
            transitionDuration: 5,
            messagePresets: [],
            activePresetName: '',
            activeTab: 'burndown',
            isListening: true,
        };

        it('loads data from local storage instead of fetching from API', async () => {
            localStorage.setItem(localStorageKey, JSON.stringify(mockFormData));
            render(<ControlPanelPage />);

            await waitFor(() => {
                expect(mockedAxios.get).not.toHaveBeenCalled();
                expect(screen.getByText('バーンダウンチャート設定')).toBeInTheDocument();
                expect(screen.getByLabelText('目標値')).toHaveValue(mockFormData.burndown.targetValue);
                const historyContainer = screen.getByTestId('burndown-history');
                expect(within(historyContainer).getByText((content, element) => {
                    return content.includes('50');
                })).toBeInTheDocument();
            });
        });

        it('saves updated form data to local storage', async () => {
            const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
            
            render(<ControlPanelPage />);
            await waitFor(() => expect(screen.getByLabelText('値')).toHaveValue(mockData.scoreValue));
            
            const scoreLabelInput = screen.getByLabelText('フィールド名');
            await act(async () => {
                fireEvent.change(scoreLabelInput, { target: { value: 'A New Value' } });
            });
            
            await waitFor(() => {
                expect(setItemSpy).toHaveBeenCalledWith(
                    localStorageKey,
                    expect.stringContaining('"scoreLabel":"A New Value"')
                );
            });
        });

        it('persists the active tab state', async () => {
            const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
            
            render(<ControlPanelPage />);
            await waitFor(() => expect(screen.getByText('スコア設定')).toBeInTheDocument());

            await act(async () => {
                fireEvent.click(screen.getByRole('tab', { name: 'メッセージ' }));
            });

            await waitFor(() => {
                expect(setItemSpy).toHaveBeenCalledWith(
                    localStorageKey,
                    expect.stringContaining('"activeTab":"message"')
                );
            });
        });

        it('persists the voice recognition listening state', async () => {
            const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
            
            render(<ControlPanelPage />);
            await waitFor(() => expect(screen.getByText('スコア設定')).toBeInTheDocument());

            fireEvent.click(screen.getByRole('tab', { name: '共通設定' }));
            const toggleButton = await screen.findByRole('button', { name: '音声認識を開始' });
            
            await act(async () => {
                fireEvent.click(toggleButton);
            });

            await waitFor(() => {
                expect(setItemSpy).toHaveBeenCalledWith(
                    localStorageKey,
                    expect.stringContaining('"isListening":true')
                );
                expect(screen.getByRole('button', { name: '音声認識を停止' })).toBeInTheDocument();
            });
        });

        it('clears local storage and reloads when "Clear Cache" button is clicked', async () => {
            localStorage.setItem(localStorageKey, JSON.stringify(mockFormData));
            const removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem');

            render(<ControlPanelPage />);
            await waitFor(() => expect(screen.getByLabelText('目標値')).toHaveValue(100));
            
            fireEvent.click(screen.getByRole('tab', { name: '共通設定' }));
            
            const clearButton = await screen.findByRole('button', { name: '入力キャッシュをクリア' });
            
            await act(async () => {
                fireEvent.click(clearButton);
            });
            
            await waitFor(() => {
                expect(removeItemSpy).toHaveBeenCalledWith(localStorageKey);
                expect(window.location.reload).toHaveBeenCalled();
            });
        });

        it('shows an error message and clear button if local storage data is corrupt', async () => {
            localStorage.setItem(localStorageKey, 'this is not json');
            render(<ControlPanelPage />);

            await waitFor(() => {
                expect(screen.getByText(/設定の読み込みに失敗しました/)).toBeInTheDocument();
            });

            const clearButton = screen.getByRole('button', { name: 'キャッシュをクリア' });
            expect(clearButton).toBeInTheDocument();

            const removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem');
            fireEvent.click(clearButton);

            await waitFor(() => {
                expect(removeItemSpy).toHaveBeenCalledWith(localStorageKey);
                expect(window.location.reload).toHaveBeenCalled();
            });
        });
    });
});