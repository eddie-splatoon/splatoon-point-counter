import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ControlPanelShell from '../../components/ControlPanelShell';
import { getDefaultSidePanelSettings } from '../../lib/sidePanelTypes';

import LivePage from './page';

import type { JoinQueuePanelView } from '../../lib/joinQueueTypes';
import type { ComponentPropsWithoutRef } from 'react';

// 幅 600px 未満のコンパクト表示で、本物のカードを外枠ごと描く（折りたたみに portal で入るもの・ヘッダーの詰め方を確かめる）
vi.mock('axios');
const mockedAxios = vi.mocked(axios);
vi.mock('next/image', () => ({
    // eslint-disable-next-line @next/next/no-img-element
    default: (props: ComponentPropsWithoutRef<'img'>) => <img {...props} alt={props.alt} />,
}));
const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }), usePathname: () => '/control-panel' }));

const presets = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, text: `テロップ${i + 1}`, speak: false, followFont: true, display: true, chat: false }));
const job = { id: 1, goldenEggs: 30, bossKills: 12, deaths: 1, cleared: true, waveReached: 3, stage: 'どんぴこ', createdAt: 0, weapons: [] };
const queue = (open: boolean): JoinQueuePanelView => ({
    open,
    current: open ? { userId: '1', userName: 'ViewerA', rating: null, unreadable: false, joinedAt: 1, ratedAt: 1 } : null,
    entries: open ? [{ position: 1, userId: '2', userName: 'ViewerB', rating: null, unreadable: false, joinedAt: 2, ratedAt: 2 }] : [],
    streamer: null,
    room: { estimate: null, counted: 0, unknown: 0, wild: 3, stale: 0, lowest: null, lowerTier: 0 },
    shiftStart: null,
    recommended: null,
    reconnectedAt: null,
    history: [],
    revision: 1,
});

const respond = (open: boolean) => {
    mockedAxios.get.mockImplementation(async (url: string) => {
        const data = (() => {
            if (url === '/api/telop') return { presets, current: null, revision: 0 };
            if (url === '/api/salmon') return { session: null, lastJob: job, totals: { jobs: 1, goldenEggs: 30, bossKills: 12, deaths: 1, clears: 1, failures: 0 }, jobs: [job], bossRanking: { lastJob: [], session: [] } };
            if (url === '/api/salmon/import') return { imports: [] };
            if (url === '/api/salmon-schedule') return { entries: [] };
            if (url.startsWith('/api/join-queue')) return queue(open);
            if (url === '/api/side-panel') return { ...getDefaultSidePanelSettings(), challenges: [{ id: 1, text: 'オカシラを倒す', done: false }] };
            if (url === '/api/score-display') return { scoreLabel: 'ラベル', scoreValue: '1', autoUpdate: true };
            if (url === '/api/weapon-card') return { startedAt: 0, total: 71, obtained: [] };
            return { active: false, startedAt: null, voiceHeardAt: null, serverTime: 0 };
        })();
        return { data, status: 200 };
    });
};

beforeEach(() => {
    vi.clearAllMocks();
    window.matchMedia = ((query: string) => ({
        matches: true, media: query, onchange: null,
        addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
    delete (window as { matchMedia?: unknown }).matchMedia;
});

const renderPage = async () => {
    render(<ControlPanelShell><LivePage /></ControlPanelShell>);
    await screen.findByText('テロップ1');
    await screen.findByText('オカシラを倒す');
};

describe('LivePage on a narrow screen', () => {
    it('keeps the first ten telops, the import, the next person and the challenges outside the fold', async () => {
        respond(true);
        await renderPage();
        const fold = screen.getByTestId('compact-fold');

        const keys = within(screen.getByTestId('telop-buttons')).getAllByRole('button');
        expect(keys).toHaveLength(10);
        [screen.getByTestId('telop-buttons'), screen.getByRole('button', { name: 'リザルトを取り込む' }), screen.getByRole('button', { name: '次の人を呼ぶ' }), screen.getByRole('checkbox', { name: 'オカシラを倒す' })]
            .forEach((element) => expect(fold).not.toContainElement(element));
        expect(screen.getByTestId('salmon-totals')).toHaveTextContent('金 30オオモノ 12デス 1クリア 1/1');
    });

    it('moves the other telops, the records, the queue and the rest into the fold', async () => {
        respond(true);
        await renderPage();
        const fold = screen.getByTestId('compact-fold');

        await waitFor(() => expect(within(fold).getByText('テロップ11')).toBeInTheDocument());
        // 閉じている間は隠れているので、隠れた要素も探す
        expect(within(fold).getByRole('button', { name: /LOVE/, hidden: true })).toBeInTheDocument();
        expect(within(fold).getByTestId('salmon-recent')).toBeInTheDocument();
        expect(within(fold).getByTestId('score-display-value')).toBeInTheDocument();
        expect(within(fold).getByRole('list', { name: '受付の列', hidden: true })).toBeInTheDocument();
        expect(within(fold).getByRole('button', { name: '受付を終わる', hidden: true })).toBeInTheDocument();
        expect(fold).not.toBeVisible();

        // 開くと見える。中のボタンは同じカードのものとして動く
        fireEvent.click(screen.getByRole('button', { name: /ほかのテロップ・エフェクト・クリップ・記録/ }));
        expect(fold).toBeVisible();
        mockedAxios.post.mockResolvedValue({ data: {}, status: 200 });
        await act(async () => fireEvent.click(within(fold).getByRole('button', { name: 'テロップ11' })));
        expect(mockedAxios.post).toHaveBeenCalledWith('/api/telop', { presetId: 11 });
    });

    it('shows the queue card only while the queue is open, with the start button in the fold', async () => {
        respond(false);
        await renderPage();
        const fold = screen.getByTestId('compact-fold');

        await waitFor(() => expect(within(fold).getByRole('button', { name: '受付を始める', hidden: true })).toBeInTheDocument());
        expect(screen.queryByRole('button', { name: '次の人を呼ぶ' })).not.toBeInTheDocument();
    });

    it('shows the phases as a select, a short break button and hides the save status', async () => {
        respond(false);
        await renderPage();

        const phase = screen.getByRole('combobox', { name: 'フェーズ' });
        expect(phase).toHaveValue('/control-panel');
        fireEvent.change(phase, { target: { value: '/control-panel/prepare' } });
        expect(push).toHaveBeenCalledWith('/control-panel/prepare');
        expect(screen.getByRole('button', { name: '休憩' })).toBeInTheDocument();
        expect(screen.queryByText('変更はすぐ保存')).not.toBeInTheDocument();
    });
});
