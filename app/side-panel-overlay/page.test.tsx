import { act, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getDefaultSidePanelSettings, SidePanelSettings } from '../../lib/sidePanelTypes';
import { getInitialStreamData } from '../api/stream-data/route';

import SidePanelOverlayPage from './page';

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

vi.mock('../../components/SalmonStats', () => ({
  default: ({ totals }: { totals: { goldenEggs: number } }) => <div data-testid="SalmonStats">金イクラ {totals.goldenEggs}</div>,
}));
vi.mock('../../components/InkTankGauge', () => ({
  default: ({ current, target }: { current: number; target: number }) => <div data-testid="InkTankGauge">{current} / {target}</div>,
}));
vi.mock('../../components/SalmonSchedule', () => ({
  default: ({ schedule }: { schedule: { stage: { name: string } } | null }) => (
    <div data-testid="SalmonSchedule">{schedule ? schedule.stage.name : 'none'}</div>
  ),
}));
vi.mock('../../components/ChallengeList', () => ({
  default: ({ challenges }: { challenges: { text: string }[] }) => <div data-testid="ChallengeList">{challenges.map((c) => c.text).join(',')}</div>,
}));
vi.mock('../../components/WeaponCard', () => ({
  default: ({ card, compact }: { card: { obtained: unknown[]; total: number }; compact?: boolean }) => (
    <div data-testid="WeaponCard" data-compact={compact}>{card.obtained.length} / {card.total}</div>
  ),
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
    mockApis({ ...getDefaultSidePanelSettings(), fixedSlots: ['burndown'] });
    render(<SidePanelOverlayPage />);

    expect(await screen.findByTestId('BurndownChart')).toHaveTextContent(getInitialStreamData().burndown.label);
  });

  it('shows the challenges slot when it is selected', async () => {
    mockApis({ ...getDefaultSidePanelSettings(), fixedSlots: ['challenges'], challenges: [{ id: 1, text: 'キケン度MAXでクリア', done: false }] });
    render(<SidePanelOverlayPage />);

    expect(await screen.findByTestId('ChallengeList')).toHaveTextContent('キケン度MAXでクリア');
  });

  it('shows the compact weapon card when it is selected', async () => {
    mockApis({ ...getDefaultSidePanelSettings(), fixedSlots: ['weaponCard'] });
    render(<SidePanelOverlayPage />);

    const card = await screen.findByTestId('WeaponCard');
    expect(card).toHaveTextContent('1 / 71');
    expect(card).toHaveAttribute('data-compact', 'true');
  });

  it('shows several slots together from top to bottom', async () => {
    mockApis({ ...getDefaultSidePanelSettings(), fixedSlots: ['salmon', 'challenges'], challenges: [{ id: 1, text: 'お題', done: false }] });
    render(<SidePanelOverlayPage />);

    await screen.findByTestId('ChallengeList');
    const order = [...screen.getByTestId('side-panel-slot').querySelectorAll('[data-slot]')].map((el) => el.getAttribute('data-slot'));
    expect(order).toEqual(['salmon', 'challenges']);
    expect(screen.getByTestId('SalmonStats')).toBeInTheDocument();
  });

  it('shows the running salmon run schedule above the stats', async () => {
    mockApis({ ...getDefaultSidePanelSettings(), fixedSlots: ['schedule', 'salmon'] });
    render(<SidePanelOverlayPage />);

    expect(await screen.findByTestId('SalmonSchedule')).toHaveTextContent('アラマキ砦');
    const order = [...screen.getByTestId('side-panel-slot').querySelectorAll('[data-slot]')].map((el) => el.getAttribute('data-slot'));
    expect(order).toEqual(['schedule', 'salmon']);
  });

  it('shows nothing in the schedule slot until the schedule is fetched', async () => {
    mockApis({ ...getDefaultSidePanelSettings(), fixedSlots: ['schedule', 'salmon'] }, ['/api/salmon-schedule']);
    render(<SidePanelOverlayPage />);

    await screen.findByTestId('SalmonStats');
    expect(screen.queryByTestId('SalmonSchedule')).not.toBeInTheDocument();
  });

  it('switches slots when the setting changes', async () => {
    mockApis(getDefaultSidePanelSettings());
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<SidePanelOverlayPage />);
    await screen.findByTestId('SalmonStats');

    mockApis({ ...getDefaultSidePanelSettings(), fixedSlots: ['burndown'] });
    await advance(2000);

    expect(await screen.findByTestId('BurndownChart')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId('SalmonStats')).not.toBeInTheDocument());
  });

  it('rotates through the rotation slots', async () => {
    mockApis(rotating);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<SidePanelOverlayPage />);
    await screen.findByTestId('SalmonStats');
    expect(rotationSlot()).toBe('salmon');

    await advance(10_000);
    await waitFor(() => expect(rotationSlot()).toBe('burndown'));

    await advance(10_000);
    await waitFor(() => expect(rotationSlot()).toBe('salmon'));
  });

  it('rotates through three or more rotation slots in order and loops back', async () => {
    mockApis({
      ...rotating,
      rotationSlots: ['schedule', 'salmon', 'weaponCard', 'challenges'],
      challenges: [{ id: 1, text: 'お題', done: false }],
    });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<SidePanelOverlayPage />);
    await waitFor(() => expect(rotationSlot()).toBe('schedule'));

    for (const expected of ['salmon', 'weaponCard', 'challenges', 'schedule', 'salmon']) {
      await advance(10_000);
      await waitFor(() => expect(rotationSlot()).toBe(expected));
    }
  });

  it('skips a rotation slot with nothing to show', async () => {
    // お題が0個なら「本日のお題」は何も表示しないので、空白の時間を作らずに飛ばす
    mockApis({ ...rotating, fixedSlots: ['schedule'], rotationSlots: ['salmon', 'weaponCard', 'challenges'], challenges: [] });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<SidePanelOverlayPage />);
    await waitFor(() => expect(rotationSlot()).toBe('salmon'));

    for (const expected of ['weaponCard', 'salmon', 'weaponCard']) {
      await advance(10_000);
      await waitFor(() => expect(rotationSlot()).toBe(expected));
    }
  });

  it('keeps the fixed slots while rotating below them', async () => {
    mockApis({ ...rotating, fixedSlots: ['schedule'], rotationSlots: ['salmon', 'challenges'], challenges: [{ id: 1, text: 'お題', done: false }] });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<SidePanelOverlayPage />);
    await screen.findByTestId('SalmonStats');
    expect(fixedSlots()).toEqual(['schedule']);
    expect(rotationSlot()).toBe('salmon');

    await advance(10_000);
    await waitFor(() => expect(rotationSlot()).toBe('challenges'));
    expect(fixedSlots()).toEqual(['schedule']);
    expect(screen.getByTestId('SalmonSchedule')).toBeInTheDocument();
  });

  it('does not show the rotation area without rotation slots', async () => {
    mockApis(getDefaultSidePanelSettings());
    render(<SidePanelOverlayPage />);
    await screen.findByTestId('SalmonStats');

    expect(fixedSlots()).toEqual(['salmon']);
    expect(screen.queryByTestId('side-panel-rotation')).not.toBeInTheDocument();
  });

  it('restarts the rotation from the first slot when it is emptied and set again', async () => {
    mockApis(rotating);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<SidePanelOverlayPage />);
    await screen.findByTestId('SalmonStats');
    await advance(10_000);
    await waitFor(() => expect(rotationSlot()).toBe('burndown'));

    mockApis({ ...rotating, fixedSlots: ['burndown'], rotationSlots: [] });
    await advance(2000);
    mockApis(rotating);
    await advance(2000);

    await waitFor(() => expect(rotationSlot()).toBe('salmon'));
  });

  it('restarts the rotation when the rotation slots change', async () => {
    mockApis(rotating);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<SidePanelOverlayPage />);
    await screen.findByTestId('SalmonStats');
    await advance(10_000);
    await waitFor(() => expect(rotationSlot()).toBe('burndown'));

    mockApis({ ...rotating, rotationSlots: ['burndown'] });
    await advance(2000);
    await waitFor(() => expect(rotationSlot()).toBe('burndown'));

    // 1スロットだけなら、周期が来ても同じスロットのまま
    await advance(10_000);
    expect(rotationSlot()).toBe('burndown');
  });

  it('keeps the last settings when fetching them fails', async () => {
    mockApis({ ...getDefaultSidePanelSettings(), fixedSlots: ['burndown'] });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<SidePanelOverlayPage />);
    await screen.findByTestId('BurndownChart');

    mockApis(getDefaultSidePanelSettings(), ['/api/side-panel']);
    await advance(2000);

    expect(fixedSlots()).toEqual(['burndown']);
  });

  it('keeps showing a slot when another API fails', async () => {
    mockApis(getDefaultSidePanelSettings(), ['/api/stream-data']);
    render(<SidePanelOverlayPage />);

    expect(await screen.findByTestId('SalmonStats')).toBeInTheDocument();
  });

  describe('follower gauge', () => {
    const twitch = { ...noTwitch, followerTotal: 10, updatedAt: 1, revision: 1 };

    it('shows the Twitch follower goal', async () => {
      mockApis({ ...getDefaultSidePanelSettings(), followerGoal: 50 }, [], { ...twitch, goal: { current: 12, target: 30 } });
      render(<SidePanelOverlayPage />);

      expect(await screen.findByTestId('InkTankGauge')).toHaveTextContent('12 / 30');
    });

    it('uses the manual goal when Twitch has no follower goal', async () => {
      mockApis({ ...getDefaultSidePanelSettings(), followerGoal: 50 }, [], twitch);
      render(<SidePanelOverlayPage />);

      expect(await screen.findByTestId('InkTankGauge')).toHaveTextContent('10 / 50');
    });

    it('is hidden without any goal', async () => {
      mockApis(getDefaultSidePanelSettings(), [], twitch);
      render(<SidePanelOverlayPage />);

      await screen.findByTestId('SalmonStats');
      expect(screen.queryByTestId('InkTankGauge')).not.toBeInTheDocument();
    });

    it('is hidden while the Twitch script is not running', async () => {
      mockApis({ ...getDefaultSidePanelSettings(), followerGoal: 50 });
      render(<SidePanelOverlayPage />);

      await screen.findByTestId('SalmonStats');
      expect(screen.queryByTestId('InkTankGauge')).not.toBeInTheDocument();
    });
  });
});
