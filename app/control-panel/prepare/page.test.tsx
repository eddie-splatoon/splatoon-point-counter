import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axios from 'axios';
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import ControlPanelShell from '../../../components/ControlPanelShell';
import { getInitialStreamData, StreamData } from '../../api/stream-data/route';

import PreparePage from './page';

import type { ComponentPropsWithoutRef } from 'react';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

vi.mock('../../../components/SidePanelSettingsPanel', () => ({ default: () => <div>SidePanelSettingsPanel</div> }));
vi.mock('next/image', () => ({
    // eslint-disable-next-line @next/next/no-img-element
    default: (props: ComponentPropsWithoutRef<'img'>) => <img {...props} alt={props.alt} />,
}));

const originalLocation = window.location;
beforeAll(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: { ...originalLocation, reload: vi.fn() } });
});
afterAll(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
});

let mockData: StreamData;
const respond = (streamData: StreamData) => {
    mockedAxios.get.mockImplementation(async (url: string) => {
        if (url === '/api/stream-data') return { data: streamData, status: 200 };
        if (url === '/api/telop') return { data: { presets: [], current: null, revision: 0 }, status: 200 };
        return { data: { active: false, startedAt: null, voiceHeardAt: null, serverTime: 0 }, status: 200 };
    });
};

// ヘッダーの「変更はすぐ保存」もあわせて確かめるため、共通の外枠の中に置く
const renderPage = () => render(<ControlPanelShell><PreparePage /></ControlPanelShell>);
const openPage = async () => {
    const view = renderPage();
    await screen.findByText('バーンダウンチャート設定');
    return view;
};

beforeEach(() => {
    vi.clearAllMocks();
    mockData = getInitialStreamData();
    respond(mockData);
    mockedAxios.post.mockResolvedValue({ data: {}, status: 200 });
    localStorage.clear();
});

describe('PreparePage', () => {
    it('shows what is decided before a stream', async () => {
        await openPage();
        expect(screen.getByText('SidePanelSettingsPanel')).toBeInTheDocument();
        expect(screen.getByText('視聴者向け概要メッセージ')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /OBSに反映/ })).not.toBeInTheDocument();
    });

    it('adds and removes a burndown entry', async () => {
        await openPage();

        fireEvent.change(screen.getByLabelText('新しいポイント'), { target: { value: '150' } });
        fireEvent.click(within(screen.getByText('バーンダウンチャート設定').closest('.MuiPaper-root') as HTMLElement).getByRole('button', { name: '追加' }));
        expect(within(screen.getByTestId('burndown-history')).getByText((content) => content.includes('150'))).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /remove entry 150/i }));
        expect(within(screen.getByTestId('burndown-history')).queryByText((content) => content.includes('150'))).not.toBeInTheDocument();
    });

    describe('Saving the settings', () => {
        it('saves only the changed setting after a short pause', async () => {
            await openPage();

            fireEvent.change(screen.getByLabelText('フィールド名'), { target: { value: 'A' } });
            fireEvent.change(screen.getByLabelText('フィールド名'), { target: { value: 'A New Value' } });

            // 入力のたびには送らず、止まってから 1 回だけ送る。スコア・エフェクトなどほかの項目は送らない
            await waitFor(() => expect(mockedAxios.post).toHaveBeenCalledTimes(1));
            expect(mockedAxios.post).toHaveBeenCalledWith('/api/stream-data', {
                burndown: { ...mockData.burndown, label: 'A New Value' },
            });
        });

        it('shows the failure in the header and sends the change again later', async () => {
            mockedAxios.post.mockRejectedValueOnce(new Error('network error'));
            await openPage();
            expect(screen.getByText('変更はすぐ保存')).toBeInTheDocument();

            fireEvent.change(screen.getByLabelText('フィールド名'), { target: { value: 'A' } });
            expect(await screen.findByText('保存できませんでした')).toBeInTheDocument();

            // 保存できなかった変更も、次の保存でまとめて送る
            fireEvent.change(screen.getByLabelText('目標値'), { target: { value: '300' } });
            await waitFor(() => expect(mockedAxios.post).toHaveBeenLastCalledWith('/api/stream-data', {
                burndown: { ...mockData.burndown, label: 'A', targetValue: 300 },
            }));
            expect(await screen.findByText('変更はすぐ保存')).toBeInTheDocument();
        });

        it('waits for the save in flight and then sends what changed since', async () => {
            let finishFirst: (value: unknown) => void = () => {};
            mockedAxios.post.mockReturnValueOnce(new Promise((resolve) => { finishFirst = resolve; }));
            await openPage();

            fireEvent.change(screen.getByLabelText('フィールド名'), { target: { value: 'A' } });
            await waitFor(() => expect(mockedAxios.post).toHaveBeenCalledTimes(1));

            // 送っている間に変えたものは、前の保存が終わってから送る（順番を守る）
            fireEvent.change(screen.getByLabelText('目標値'), { target: { value: '300' } });
            await act(() => new Promise((resolve) => setTimeout(resolve, 700)));
            expect(mockedAxios.post).toHaveBeenCalledTimes(1);

            await act(async () => finishFirst({ data: {}, status: 200 }));
            await waitFor(() => expect(mockedAxios.post).toHaveBeenCalledTimes(2));
            expect(mockedAxios.post).toHaveBeenLastCalledWith('/api/stream-data', {
                burndown: { ...mockData.burndown, label: 'A', targetValue: 300 },
            });
        });

        it('sends a pending change with keepalive when the tab is closed', async () => {
            const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
            await openPage();

            fireEvent.change(screen.getByLabelText('フィールド名'), { target: { value: 'Closing' } });
            window.dispatchEvent(new Event('pagehide'));

            expect(fetchSpy).toHaveBeenCalledWith('/api/stream-data', expect.objectContaining({
                method: 'POST',
                keepalive: true,
                body: JSON.stringify({ burndown: { ...mockData.burndown, label: 'Closing' } }),
            }));
            fetchSpy.mockRestore();
        });

        it('saves a pending change when moving to another screen', async () => {
            const { unmount } = await openPage();

            fireEvent.change(screen.getByLabelText('フィールド名'), { target: { value: 'Leaving' } });
            unmount();

            await waitFor(() => expect(mockedAxios.post).toHaveBeenCalledWith('/api/stream-data', {
                burndown: { ...mockData.burndown, label: 'Leaving' },
            }));
        });

        it('shows an error when the settings cannot be loaded', async () => {
            const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            mockedAxios.get.mockImplementation(async (url: string) => {
                if (url === '/api/stream-data') throw new Error('network error');
                return { data: { presets: [] }, status: 200 };
            });
            renderPage();

            expect(await screen.findByText(/設定を読み込めませんでした/)).toBeInTheDocument();
            fireEvent.click(screen.getByRole('button', { name: '読み込み直す' }));
            expect(window.location.reload).toHaveBeenCalled();
            errorSpy.mockRestore();
        });
    });

    describe('Settings left in local storage by the old control panel', () => {
        const localStorageKey = 'control-panel-state';
        const legacyState = {
            scoreLabel: 'Local Score',
            scoreValue: '12345',
            burndown: { label: 'Local Burndown', targetValue: 100, entries: [{ score: 50, timestamp: 1 }] },
            fontFamily: 'Arial',
            fontSize: 20,
            transitionEffect: 'slide',
            transitionDuration: 5,
            messagePresets: [],
            activePresetName: '',
            activeTab: 'burndown',
        };
        const legacySettings = {
            burndown: legacyState.burndown,
            fontFamily: 'Arial',
            fontSize: 20,
            transitionEffect: 'slide',
            transitionDuration: 5,
            messagePresets: [],
            activePresetName: '',
        };

        it('moves them to the server once when nothing is saved there', async () => {
            localStorage.setItem(localStorageKey, JSON.stringify(legacyState));
            mockedAxios.post.mockResolvedValue({ data: { ...mockData, ...legacySettings, settingsStored: true }, status: 200 });
            renderPage();

            expect(await screen.findByLabelText('目標値')).toHaveValue(100);
            // スコアは /api/score-display で別に保存するので送らない
            expect(mockedAxios.post).toHaveBeenCalledTimes(1);
            expect(mockedAxios.post).toHaveBeenCalledWith('/api/stream-data', legacySettings);
            expect(localStorage.getItem(localStorageKey)).toBeNull();
        });

        it('drops them when the server already has saved ones', async () => {
            localStorage.setItem(localStorageKey, JSON.stringify(legacyState));
            respond({ ...mockData, settingsStored: true });
            renderPage();

            expect(await screen.findByLabelText('目標値')).toHaveValue(mockData.burndown.targetValue);
            await act(() => new Promise((resolve) => setTimeout(resolve, 600)));
            expect(mockedAxios.post).not.toHaveBeenCalled();
            expect(localStorage.getItem(localStorageKey)).toBeNull();
        });

        it('ignores broken data', async () => {
            localStorage.setItem(localStorageKey, 'this is not json');
            renderPage();
            expect(await screen.findByText('バーンダウンチャート設定')).toBeInTheDocument();
            expect(localStorage.getItem(localStorageKey)).toBeNull();
        });
    });
});
