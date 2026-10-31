import { act, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getDefaultSidePanelSettings, SidePanelSettings } from '../../../lib/sidePanelTypes';
import { getInitialStreamData } from '../../api/stream-data/route';

import VerticalSidePanelOverlayPage from './page';

import type { ReactNode } from 'react';

// クロスフェードを本物のまま動かすと、切り替え直後は消えかけの古いスロットが残り、負荷が高いと待ち時間内に消えずに落ちることがある。
// ここではアニメーションではなく、どのスロットを出すかを確かめたいので、すぐに切り替わる単純な要素に置き換える
vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    div: ({ initial, animate, exit, transition, ...props }: Record<string, unknown>) => <div {...props} />,
  },
}));

vi.mock('../../../components/SalmonStats', () => ({
  default: ({ totals }: { totals: { goldenEggs: number } }) => <div data-testid="SalmonStats">金イクラ {totals.goldenEggs}</div>,
}));
vi.mock('../../../components/InkTankGauge', () => ({
  default: ({ current, target }: { current: number; target: number }) => <div data-testid="InkTankGauge">{current} / {target}</div>,
}));
vi.mock('../../../components/SalmonSchedule', () => ({
  default: ({ schedule }: { schedule: { stage: { name: string } } | null }) => (
    <div data-testid="SalmonSchedule">{schedule ? schedule.stage.name : 'none'}</div>
  ),
}));
vi.mock('../../../components/ChallengeList', () => ({
  default: ({ challenges }: { challenges: { text: string }[] }) => <div data-testid="ChallengeList">{challenges.map((c) => c.text).join(',')}</div>,
}));
vi.mock('../../../components/WeaponCard', () => ({
  default: ({ card, compact }: { card: { obtained: unknown[]; total: number }; compact?: boolean }) => (
    <div data-testid="WeaponCard" data-compact={compact}>{card.obtained.length} / {card.total}</div>
  ),
}));
vi.mock('../../../components/BurndownChart', () => ({
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

const noTwitch = { followerTotal: null, goal: null, lastFollowAt: null, updatedAt: null, revision: 0 };

const scheduleData = (stage: string) => ({
  entries: [{ kind: 'regular', startTime: Date.now() - 60_000, endTime: Date.now() + 60 * 60_000, stage: { name: stage, image: '' }, weapons: [] }],
  fetchedAt: Date.now(),
});

const mockApis = (settings: SidePanelSettings, failing: string[] = [], twitch: object = noTwitch, schedule: object = scheduleData('アラマキ砦')) => {
  mockedAxios.get.mockImplementation(async (url: string) => {
    if (failing.includes(url)) throw new Error('500');
    if (url === '/api/side-panel') return { data: settings, status: 200 };
    if (url === '/api/salmon') return { data: salmonSummary, status: 200 };
    if (url === '/api/stream-data') return { data: getInitialStreamData(), status: 200 };
    if (url === '/api/twitch') return { data: twitch, status: 200 };
    if (url === '/api/salmon-schedule') return { data: schedule, status: 200 };
    if (url === '/api/weapon-card') return { data: { startedAt: 0, total: 71, obtained: [{ key: 'sshooter', at: 1, source: 'job' }] }, status: 200 };
    throw new Error(`unexpected ${url}`);
  });
};

// ローテーション枠でいま表示しているスロット
const rotationSlot = () => screen.queryByTestId('side-panel-rotation')?.querySelector('[data-area="rotation"]')?.getAttribute('data-slot');
const fixedSlots = () => [...screen.getByTestId('side-panel-slot').querySelectorAll('[data-area="fixed"]')].map((el) => el.getAttribute('data-slot'));
const rotating: SidePanelSettings = { ...getDefaultSidePanelSettings(), fixedSlots: [], rotationSlots: ['salmon', 'burndown'], rotateSeconds: 10 };

// React の Scheduler は偽タイマーを入れる前の本物の setImmediate で effect を流す。負荷が高いと、スロットが表示された時点で
// ローテーションのタイマー（effect で作る setInterval）がまだ作られていないことがあるので、effect を流してから時間を進める
const realSetImmediate = globalThis.setImmediate;
const advance = async (ms: number) => {
  await act(() => new Promise<void>((resolve) => realSetImmediate(() => resolve())));
  await act(async () => vi.advanceTimersByTime(ms));
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('VerticalSidePanelOverlayPage', () => {
  const twitch = { ...noTwitch, followerTotal: 10, updatedAt: 1, revision: 1 };

  it('fits the frame at the top of a 1080x1920 canvas', () => {
    mockedAxios.get.mockReturnValue(new Promise(() => {}));
    const { container } = render(<VerticalSidePanelOverlayPage />);
    expect(container.firstChild).toHaveStyle({ width: '990px', height: '440px' });
  });

  it('shows the gauge and the fixed slots side by side with the rotation slot last', async () => {
    mockApis(
      { ...rotating, fixedSlots: ['schedule', 'salmon'], rotationSlots: ['weaponCard', 'burndown'], followerGoal: 50 },
      [],
      twitch,
    );
    render(<VerticalSidePanelOverlayPage />);

    expect(await screen.findByTestId('InkTankGauge')).toHaveTextContent('10 / 50');
    expect(await screen.findByTestId('WeaponCard')).toBeInTheDocument();
    expect(fixedSlots()).toEqual(['schedule', 'salmon']);
    expect(rotationSlot()).toBe('weaponCard');
    // 3 列とゲージを横に並べるので、カードは縮める
    expect(Number(screen.getByTestId('side-panel-slot').getAttribute('data-scale'))).toBeLessThan(1);
  });

  it('rotates through the rotation slots', async () => {
    mockApis(rotating);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<VerticalSidePanelOverlayPage />);
    await screen.findByTestId('SalmonStats');
    expect(rotationSlot()).toBe('salmon');

    await advance(10_000);
    await waitFor(() => expect(rotationSlot()).toBe('burndown'));
  });

  it('enlarges a single slot', async () => {
    mockApis(getDefaultSidePanelSettings());
    render(<VerticalSidePanelOverlayPage />);

    await screen.findByTestId('SalmonStats');
    expect(screen.getByTestId('side-panel-slot')).toHaveAttribute('data-scale', '1.5');
  });

  it('does not leave an empty column for a slot with nothing to show', async () => {
    mockApis({ ...getDefaultSidePanelSettings(), fixedSlots: ['schedule', 'salmon', 'challenges'], challenges: [] }, ['/api/salmon-schedule']);
    render(<VerticalSidePanelOverlayPage />);

    await screen.findByTestId('SalmonStats');
    expect(fixedSlots()).toEqual(['salmon']);
    // 列が 1 つなので、空いた列の分まで縮めない
    expect(screen.getByTestId('side-panel-slot')).toHaveAttribute('data-scale', '1.5');
  });
});
