import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import LivePage from './page';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

// 各カードは独自に API を呼ぶ（中身はそれぞれのテスト）。ここでは配信中の画面に並ぶことだけを確認する
vi.mock('../../components/SalmonRunPanel', () => ({ default: () => <div>SalmonRunPanel</div> }));
vi.mock('../../components/ScoreDisplayPanel', () => ({ default: () => <div>ScoreDisplayPanel</div> }));
vi.mock('../../components/JoinQueuePanel', () => ({ default: () => <div>JoinQueuePanel</div> }));
vi.mock('../../components/ClipPanel', () => ({ default: () => <div>ClipPanel</div> }));
vi.mock('../../components/TelopBar', () => ({ default: () => <div>TelopBar</div> }));

beforeEach(() => {
    vi.clearAllMocks();
    mockedAxios.patch.mockResolvedValue({ data: {}, status: 200 });
});

describe('LivePage', () => {
    it('shows what is pressed during a stream', () => {
        render(<LivePage />);
        for (const name of ['TelopBar', 'SalmonRunPanel', 'JoinQueuePanel', 'ClipPanel', 'ScoreDisplayPanel']) {
            expect(screen.getByText(name)).toBeInTheDocument();
        }
        expect(screen.getByText('演出効果')).toBeInTheDocument();
    });

    describe('Effect Trigger Buttons', () => {
        const effects = [
            { name: 'LOVE', label: /LOVE/ },
            { name: 'STAR', label: /STAR/ },
            { name: 'SPARKLE', label: /SPARKLE/ },
            { name: 'BUBBLE', label: /BUBBLE/ },
        ];

        it.each(effects)('sends only the $name effect', async ({ name, label }) => {
            render(<LivePage />);

            await act(async () => {
                fireEvent.click(screen.getByRole('button', { name: label }));
            });

            // ほかの設定（入力途中の値を含む）は送らない
            expect(mockedAxios.patch).toHaveBeenCalledWith('/api/stream-data', { event: name });
            expect(mockedAxios.post).not.toHaveBeenCalled();
        });

        it('disables every effect button while a request is in flight', async () => {
            mockedAxios.patch.mockReturnValue(new Promise(() => {}));
            render(<LivePage />);

            await act(async () => {
                fireEvent.click(screen.getByRole('button', { name: /LOVE/ }));
            });

            for (const { label } of effects) {
                expect(screen.getByRole('button', { name: label })).toBeDisabled();
            }
        });

        it('shows a success message after the effect is sent', async () => {
            render(<LivePage />);

            await act(async () => {
                fireEvent.click(screen.getByRole('button', { name: /LOVE/ }));
            });

            await waitFor(() => expect(screen.getByText('送信完了')).toBeInTheDocument());
            expect(screen.getByRole('button', { name: /LOVE/ })).toBeEnabled();
        });

        it('shows an error message when the effect request fails', async () => {
            mockedAxios.patch.mockRejectedValue(new Error('network error'));
            render(<LivePage />);

            await act(async () => {
                fireEvent.click(screen.getByRole('button', { name: /LOVE/ }));
            });

            await waitFor(() => expect(screen.getByText('送信失敗')).toBeInTheDocument());
        });
    });
});
