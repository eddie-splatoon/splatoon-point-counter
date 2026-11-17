import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react';
import axios from 'axios';
import { describe, it, expect, vi, beforeEach, afterAll, beforeAll } from 'vitest';

import { getInitialStreamData, StreamData } from '../api/stream-data/route';

import ControlPanelPage from './page';
import { tokens } from './theme';

import type { ComponentPropsWithoutRef } from 'react';


// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios);



// SalmonRunPanel は独自に API を呼ぶため、ここではタブの切り替えだけを確認する（中身は SalmonRunPanel.test.tsx）
vi.mock('../../components/SalmonRunPanel', () => ({
    default: () => <div>SalmonRunPanel</div>,
}));
// スコア表示タブも独自に API を呼ぶ（中身は ScoreDisplayPanel.test.tsx）
vi.mock('../../components/ScoreDisplayPanel', () => ({
    default: () => <div>ScoreDisplayPanel</div>,
}));
vi.mock('../../components/SidePanelSettingsPanel', () => ({
    default: () => <div>SidePanelSettingsPanel</div>,
}));
// テロップバーとテロップタブも独自に API を呼ぶ。ここではプリセットの編集がテロップバーに伝わることだけを確認する
vi.mock('../../components/TelopBar', () => ({
    default: ({reloadKey}: {reloadKey: number}) => <div>TelopBar reloadKey={reloadKey}</div>,
}));
vi.mock('../../components/TelopPanel', () => ({
    default: ({onPresetsChange}: {onPresetsChange: () => void}) => <button onClick={onPresetsChange}>プリセットを編集</button>,
}));
vi.mock('../../components/VoiceSettingsPanel', () => ({
    default: () => <div>VoiceSettingsPanel</div>,
}));

// Mock next/image
vi.mock('next/image', () => ({
    default: (props: ComponentPropsWithoutRef<'img'>) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img {...props} alt={props.alt} />
    )
}));

// Mock window.location.reload
const originalLocation = window.location;
beforeAll(() => {
    Object.defineProperty(window, 'location', {
        configurable: true,
        value: { ...originalLocation, reload: vi.fn() },
    });
});
afterAll(() => {
    Object.defineProperty(window, 'location', {
        configurable: true,
        value: originalLocation,
    });
});


describe('ControlPanelPage', () => {
    let mockData: StreamData;

    beforeEach(() => {
        mockData = getInitialStreamData();
        mockedAxios.get.mockResolvedValue({ data: mockData, status: 200 });
        mockedAxios.post.mockResolvedValue({ data: {}, status: 200 });
        mockedAxios.patch.mockResolvedValue({ data: {}, status: 200 });
        localStorage.clear();
        vi.clearAllMocks();
    });

    it('fetches and displays initial data when no local storage data exists', async () => {
        render(<ControlPanelPage />);
        await waitFor(() => {
            expect(mockedAxios.get).toHaveBeenCalledWith('/api/stream-data');
            expect(screen.getByText('ScoreDisplayPanel')).toBeInTheDocument();
        });
    });
    
    it('allows switching between tabs', async () => {
        render(<ControlPanelPage />);
        await waitFor(() => expect(screen.getByText('ScoreDisplayPanel')).toBeInTheDocument());

        fireEvent.click(screen.getByRole('tab', { name: 'バーンダウン' }));
        await waitFor(() => expect(screen.getByText('バーンダウンチャート設定')).toBeInTheDocument());

        fireEvent.click(screen.getByRole('tab', { name: 'メッセージ' }));
        await waitFor(() => expect(screen.getByText('視聴者向け概要メッセージ')).toBeInTheDocument());

        fireEvent.click(screen.getByRole('tab', { name: 'サーモンラン' }));
        await waitFor(() => expect(screen.getByText('SalmonRunPanel')).toBeInTheDocument());

        fireEvent.click(screen.getByRole('tab', { name: 'サイドパネル' }));
        await waitFor(() => expect(screen.getByText('SidePanelSettingsPanel')).toBeInTheDocument());
    });

    it('shows the telop bar on every tab and reloads it after editing presets', async () => {
        render(<ControlPanelPage />);
        await waitFor(() => expect(screen.getByText('TelopBar reloadKey=0')).toBeInTheDocument());

        fireEvent.click(screen.getByRole('tab', { name: 'サーモンラン' }));
        expect(screen.getByText('TelopBar reloadKey=0')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('tab', { name: 'テロップ' }));
        fireEvent.click(await screen.findByRole('button', { name: 'プリセットを編集' }));

        expect(screen.getByText('TelopBar reloadKey=1')).toBeInTheDocument();
    });

    it('shows dropdown menus on an opaque background', async () => {
        render(<ControlPanelPage />);
        await waitFor(() => expect(screen.getByText('ScoreDisplayPanel')).toBeInTheDocument());

        fireEvent.click(screen.getByRole('tab', { name: 'メッセージ' }));
        fireEvent.mouseDown(await screen.findByRole('combobox'));

        // カードと同じ色だと重なって見分けにくいので、1 段上の面（tokens.color.surface2）で表示する
        const menuPaper = (await screen.findByRole('listbox')).closest('.MuiPaper-root');
        expect(menuPaper).toHaveStyle({ backgroundColor: tokens.color.surface2 });
    });

    it('adds and removes a burndown entry', async () => {
        render(<ControlPanelPage />);
        await waitFor(() => expect(screen.getByText('ScoreDisplayPanel')).toBeInTheDocument());

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
            expect(within(historyContainer).getByText((content) => {
                return content.includes('150');
            })).toBeInTheDocument();
        });

        const removeButton = screen.getByRole('button', { name: /remove entry 150/i }); // Use more specific name
        await act(async () => {
            fireEvent.click(removeButton);
        });
        
        await waitFor(() => {
            const historyContainer = screen.getByTestId('burndown-history');
            expect(within(historyContainer).queryByText((content) => {
                return content.includes('150');
            })).not.toBeInTheDocument();
        });
    });


    describe('Saving the settings', () => {
        const openBurndownTab = async () => {
            const view = render(<ControlPanelPage />);
            await waitFor(() => expect(screen.getByText('ScoreDisplayPanel')).toBeInTheDocument());
            fireEvent.click(screen.getByRole('tab', { name: 'バーンダウン' }));
            await screen.findByText('バーンダウンチャート設定');
            return view;
        };

        it('has no "OBSに反映" button', async () => {
            render(<ControlPanelPage />);
            await waitFor(() => expect(screen.getByText('ScoreDisplayPanel')).toBeInTheDocument());
            expect(screen.queryByRole('button', { name: /OBSに反映/ })).not.toBeInTheDocument();
        });

        it('saves only the changed setting after a short pause', async () => {
            await openBurndownTab();

            fireEvent.change(screen.getByLabelText('フィールド名'), { target: { value: 'A' } });
            fireEvent.change(screen.getByLabelText('フィールド名'), { target: { value: 'A New Value' } });

            // 入力のたびには送らず、止まってから 1 回だけ送る。スコア・エフェクトなどほかの項目は送らない
            await waitFor(() => expect(mockedAxios.post).toHaveBeenCalledTimes(1));
            expect(mockedAxios.post).toHaveBeenCalledWith('/api/stream-data', {
                burndown: { ...mockData.burndown, label: 'A New Value' },
            });
        });

        it('does not send a value typed halfway', async () => {
            render(<ControlPanelPage />);
            await waitFor(() => expect(screen.getByText('ScoreDisplayPanel')).toBeInTheDocument());
            fireEvent.click(screen.getByRole('tab', { name: '共通設定' }));

            // 数値の欄を空にすると 0 になる。フォントサイズとしては不正なので送らない
            fireEvent.change(await screen.findByLabelText('フォントサイズ (px)'), { target: { value: '' } });
            // 保存されないことを欄に出す
            expect(screen.getByText(/この値は保存されません/)).toBeInTheDocument();
            await act(() => new Promise((resolve) => setTimeout(resolve, 800)));
            expect(mockedAxios.post).not.toHaveBeenCalled();

            fireEvent.change(screen.getByLabelText('フォントサイズ (px)'), { target: { value: '60' } });
            await waitFor(() => expect(mockedAxios.post).toHaveBeenCalledWith('/api/stream-data', { fontSize: 60 }));
        });

        it('shows an error when saving fails and sends the change again later', async () => {
            mockedAxios.post.mockRejectedValueOnce(new Error('network error'));
            await openBurndownTab();

            fireEvent.change(screen.getByLabelText('フィールド名'), { target: { value: 'A' } });
            expect(await screen.findByText(/設定を保存できませんでした/)).toBeInTheDocument();

            // 保存できなかった変更も、次の保存でまとめて送る
            fireEvent.change(screen.getByLabelText('目標値'), { target: { value: '300' } });
            await waitFor(() => expect(mockedAxios.post).toHaveBeenLastCalledWith('/api/stream-data', {
                burndown: { ...mockData.burndown, label: 'A', targetValue: 300 },
            }));
            await waitFor(() => expect(screen.queryByText(/設定を保存できませんでした/)).not.toBeInTheDocument());
        });

        it('waits for the save in flight and then sends what changed since', async () => {
            let finishFirst: (value: unknown) => void = () => {};
            mockedAxios.post.mockReturnValueOnce(new Promise((resolve) => { finishFirst = resolve; }));
            await openBurndownTab();

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
            await openBurndownTab();

            fireEvent.change(screen.getByLabelText('フィールド名'), { target: { value: 'Closing' } });
            window.dispatchEvent(new Event('pagehide'));

            expect(fetchSpy).toHaveBeenCalledWith('/api/stream-data', expect.objectContaining({
                method: 'POST',
                keepalive: true,
                body: JSON.stringify({ burndown: { ...mockData.burndown, label: 'Closing' } }),
            }));
            fetchSpy.mockRestore();
        });

        it('saves a pending change when leaving the page', async () => {
            const { unmount } = await openBurndownTab();

            fireEvent.change(screen.getByLabelText('フィールド名'), { target: { value: 'Leaving' } });
            unmount();

            await waitFor(() => expect(mockedAxios.post).toHaveBeenCalledWith('/api/stream-data', {
                burndown: { ...mockData.burndown, label: 'Leaving' },
            }));
        });

        it('shows an error when the settings cannot be loaded', async () => {
            const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            mockedAxios.get.mockRejectedValue(new Error('network error'));
            render(<ControlPanelPage />);

            expect(await screen.findByText(/設定を読み込めませんでした/)).toBeInTheDocument();
            fireEvent.click(screen.getByRole('button', { name: '読み込み直す' }));
            expect(window.location.reload).toHaveBeenCalled();
            errorSpy.mockRestore();
        });
    });

    describe('Local Storage', () => {
        const localStorageKey = 'control-panel-state';
        // 以前は設定も localStorage に入れていた
        const legacyState = {
            scoreLabel: 'Local Score',
            scoreValue: '12345',
            burndown: {
                label: 'Local Burndown',
                targetValue: 100,
                entries: [{ score: 50, timestamp: 1 }],
            },
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

        it('keeps only the active tab', async () => {
            render(<ControlPanelPage />);
            await waitFor(() => expect(screen.getByText('ScoreDisplayPanel')).toBeInTheDocument());

            fireEvent.click(screen.getByRole('tab', { name: 'メッセージ' }));

            expect(JSON.parse(localStorage.getItem(localStorageKey) ?? 'null')).toEqual({ activeTab: 'message' });
        });

        it('opens the tab kept last time', async () => {
            localStorage.setItem(localStorageKey, JSON.stringify({ activeTab: 'burndown' }));
            render(<ControlPanelPage />);
            expect(await screen.findByText('バーンダウンチャート設定')).toBeInTheDocument();
        });

        it('moves the old settings to the server once when nothing is saved there', async () => {
            localStorage.setItem(localStorageKey, JSON.stringify(legacyState));
            mockedAxios.post.mockResolvedValue({ data: { ...mockData, ...legacySettings, settingsStored: true }, status: 200 });
            render(<ControlPanelPage />);

            expect(await screen.findByLabelText('目標値')).toHaveValue(100);
            // スコアは /api/score-display で別に保存するので送らない
            expect(mockedAxios.post).toHaveBeenCalledTimes(1);
            expect(mockedAxios.post).toHaveBeenCalledWith('/api/stream-data', legacySettings);
            expect(JSON.parse(localStorage.getItem(localStorageKey) ?? 'null')).toEqual({ activeTab: 'burndown' });
        });

        it('drops the old settings when the server already has saved ones', async () => {
            localStorage.setItem(localStorageKey, JSON.stringify(legacyState));
            mockedAxios.get.mockResolvedValue({ data: { ...mockData, settingsStored: true }, status: 200 });
            render(<ControlPanelPage />);

            expect(await screen.findByLabelText('目標値')).toHaveValue(mockData.burndown.targetValue);
            await act(() => new Promise((resolve) => setTimeout(resolve, 600)));
            expect(mockedAxios.post).not.toHaveBeenCalled();
            expect(JSON.parse(localStorage.getItem(localStorageKey) ?? 'null')).toEqual({ activeTab: 'burndown' });
        });

        it('ignores broken data in local storage', async () => {
            localStorage.setItem(localStorageKey, 'this is not json');
            render(<ControlPanelPage />);
            expect(await screen.findByText('ScoreDisplayPanel')).toBeInTheDocument();
        });
    });

    describe('Effect Trigger Buttons', () => {
        const effects = [
            { name: 'LOVE', label: /LOVE/ },
            { name: 'STAR', label: /STAR/ },
            { name: 'SPARKLE', label: /SPARKLE/ },
            { name: 'BUBBLE', label: /BUBBLE/ },
        ];

        const renderCommonTab = async () => {
            render(<ControlPanelPage />);
            await waitFor(() => expect(screen.getByText('ScoreDisplayPanel')).toBeInTheDocument());
            fireEvent.click(screen.getByRole('tab', { name: '共通設定' }));
            await screen.findByText('演出効果');
        };

        it.each(effects)('sends only the $name effect', async ({ name, label }) => {
            await renderCommonTab();

            await act(async () => {
                fireEvent.click(screen.getByRole('button', { name: label }));
            });

            // ほかの設定（入力途中の値を含む）は送らない
            expect(mockedAxios.patch).toHaveBeenCalledWith('/api/stream-data', { event: name });
            expect(mockedAxios.post).not.toHaveBeenCalled();
        });

        it('disables every effect button while a request is in flight', async () => {
            mockedAxios.patch.mockReturnValue(new Promise(() => {}));

            await renderCommonTab();

            await act(async () => {
                fireEvent.click(screen.getByRole('button', { name: /LOVE/ }));
            });

            for (const { label } of effects) {
                expect(screen.getByRole('button', { name: label })).toBeDisabled();
            }
        });

        it('shows a success message after the effect is sent', async () => {
            await renderCommonTab();

            await act(async () => {
                fireEvent.click(screen.getByRole('button', { name: /LOVE/ }));
            });

            await waitFor(() => expect(screen.getByText('送信完了')).toBeInTheDocument());
            expect(screen.getByRole('button', { name: /LOVE/ })).toBeEnabled();
        });

        it('shows an error message when the effect request fails', async () => {
            mockedAxios.patch.mockRejectedValue(new Error('network error'));

            await renderCommonTab();

            await act(async () => {
                fireEvent.click(screen.getByRole('button', { name: /LOVE/ }));
            });

            await waitFor(() => expect(screen.getByText('送信失敗')).toBeInTheDocument());
        });
    });
});
