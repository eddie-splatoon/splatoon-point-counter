import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import ControlPanelPage from './page';
import { getInitialStreamData, StreamData } from '../api/stream-data/route';

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
// @ts-ignore
window.SpeechRecognition = MockSpeechRecognition;
// @ts-ignore
window.webkitSpeechRecognition = MockSpeechRecognition;


// Mock next/image
vi.mock('next/image', () => ({
    default: (props) => <img {...props} alt={props.alt} />
}));


describe('ControlPanelPage', () => {
    let mockData: StreamData;

    beforeEach(() => {
        mockData = getInitialStreamData();
        mockedAxios.get.mockResolvedValue({ data: mockData, status: 200 });
        mockedAxios.post.mockResolvedValue({ data: {}, status: 200 });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('fetches and displays initial data in the correct fields', async () => {
        render(<ControlPanelPage />);

        // Wait for data to load and check score tab (default)
        await waitFor(() => {
            expect(screen.getByLabelText('フィールド名')).toHaveValue(mockData.scoreLabel);
            expect(screen.getByLabelText('値')).toHaveValue(mockData.scoreValue);
        });

        // Switch to burndown tab and check
        fireEvent.click(screen.getByRole('tab', { name: 'バーンダウン' }));
        await waitFor(() => {
            expect(screen.getByLabelText('目標値')).toHaveValue(mockData.burndown.targetValue);
        });

        // Switch to common settings tab and check
        fireEvent.click(screen.getByRole('tab', { name: '共通設定' }));
        await waitFor(() => {
            expect(screen.getByLabelText('フォントサイズ (px)')).toHaveValue(mockData.fontSize);
        });
    });

    it('allows switching between tabs', async () => {
        render(<ControlPanelPage />);
        await waitFor(() => {
            expect(screen.getByText('スコア設定')).toBeInTheDocument();
        });

        // Click Burndown Tab
        fireEvent.click(screen.getByRole('tab', { name: 'バーンダウン' }));
        await waitFor(() => {
            expect(screen.getByText('バーンダウンチャート設定')).toBeInTheDocument();
            expect(screen.queryByText('スコア設定')).not.toBeInTheDocument();
        });

        // Click Message Tab
        fireEvent.click(screen.getByRole('tab', { name: 'メッセージ' }));
        await waitFor(() => {
            expect(screen.getByText('視聴者向け概要メッセージ')).toBeInTheDocument();
        });
    });

    it('updates score fields and sends correct payload on submit', async () => {
        render(<ControlPanelPage />);
        await waitFor(() => {
            expect(screen.getByLabelText('値')).toHaveValue(mockData.scoreValue);
        });

        const scoreLabelInput = screen.getByLabelText('フィールド名');
        const scoreValueInput = screen.getByLabelText('値');

        await act(async () => {
            fireEvent.change(scoreLabelInput, { target: { value: 'New Score' } });
            fireEvent.change(scoreValueInput, { target: { value: '9999' } });
        });
        
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /OBSに反映/ }));
        });
        
        expect(mockedAxios.post).toHaveBeenCalledWith('/api/stream-data', 
            expect.objectContaining({
                scoreLabel: 'New Score',
                scoreValue: '9999',
            })
        );
    });

    it('adds and removes a message in the message tab', async () => {
        render(<ControlPanelPage />);
        await waitFor(() => {
            expect(screen.getByLabelText('値')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('tab', { name: 'メッセージ' }));

        const initialMessages = mockData.messagePresets.find(p => p.name === '通常').messages;
        await waitFor(() => {
            expect(screen.getByText(initialMessages[0].text)).toBeInTheDocument();
        });
        
        // Add a new message
        const messageInput = screen.getByLabelText('新しいメッセージ');
        const addButton = screen.getByRole('button', { name: '追加' });

        await act(async () => {
            fireEvent.change(messageInput, { target: { value: 'A new test message' } });
        });
        await act(async () => {
            fireEvent.click(addButton);
        });
        
        expect(screen.getByText('A new test message')).toBeInTheDocument();

        // Remove a message
        // This is fragile because the icon button has no accessible name.
        const removeButtons = screen.getAllByRole('button');
        const firstRemoveButton = removeButtons.find(btn => btn.querySelector('svg[data-testid="RemoveCircleIcon"]'));

        await act(async () => {
            fireEvent.click(firstRemoveButton);
        });

        expect(screen.queryByText(initialMessages[0].text)).not.toBeInTheDocument();
    });

    it('triggers an effect with the correct payload', async () => {
        render(<ControlPanelPage />);
        await waitFor(() => {
            expect(screen.getByLabelText('値')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('tab', { name: '共通設定' }));

        await waitFor(() => {
            expect(screen.getByText('演出効果')).toBeInTheDocument();
        });

        const loveButton = screen.getByRole('button', { name: /LOVE/ });
        await act(async () => {
            fireEvent.click(loveButton);
        });

        expect(mockedAxios.post).toHaveBeenCalledWith('/api/stream-data', 
            expect.objectContaining({
                lastEvent: expect.objectContaining({ name: 'LOVE' })
            })
        );
    });
});
