import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import LivePage from './page';

// 各カードは独自に API を呼ぶ（中身はそれぞれのテスト）。ここでは配信中の画面の並びだけを確認する
vi.mock('../../components/TelopBar', () => ({ default: () => <div>TelopBar</div> }));
vi.mock('../../components/EffectClipCard', () => ({ default: () => <div>EffectClipCard</div> }));
vi.mock('../../components/SalmonRunPanel', () => ({ default: () => <div>SalmonRunPanel</div> }));
vi.mock('../../components/TimelyFixesCard', () => ({ default: () => <div>TimelyFixesCard</div> }));
vi.mock('../../components/JoinQueuePanel', () => ({ default: () => <div>JoinQueuePanel</div> }));
vi.mock('../../components/ChallengeChecklistCard', () => ({ default: () => <div>ChallengeChecklistCard</div> }));

// 幅 600px 未満のコンパクト表示にする（MUI の useMediaQuery は window.matchMedia を見る）
const narrow = () => {
    window.matchMedia = ((query: string) => ({
        matches: true, media: query, onchange: null,
        addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
};

afterEach(() => {
    // jsdom にはもともと matchMedia が無い（広い幅として描く）
    delete (window as { matchMedia?: unknown }).matchMedia;
});

describe('LivePage', () => {
    it('puts the frequently used cards first and the rest in one fold on a narrow screen', () => {
        narrow();
        render(<LivePage />);

        const fold = screen.getByTestId('compact-fold');
        expect(screen.getByRole('button', { name: /ほかのテロップ・エフェクト・クリップ・記録/ })).toHaveAttribute('aria-expanded', 'false');
        expect(fold).not.toBeVisible();
        expect(within(fold).getByText('EffectClipCard')).toBeInTheDocument();
        expect(within(fold).getByText('TimelyFixesCard')).toBeInTheDocument();
        // よく押すものは折りたたみの外に、テロップ → サーモンラン → 視聴者参加 → お題の順
        const outside = ['TelopBar', 'SalmonRunPanel', 'JoinQueuePanel', 'ChallengeChecklistCard'].map((name) => screen.getByText(name));
        outside.forEach((card) => expect(fold).not.toContainElement(card));
        outside.slice(1).forEach((card, i) => expect(outside[i].compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy());
    });

    it('puts the cards in three columns in order of priority', () => {
        const { container } = render(<LivePage />);

        // DOM の順番が、狭い幅で縦に並ぶ順番
        const columns = Array.from((container.firstChild as HTMLElement).children).map((column) => column.textContent);
        expect(columns).toEqual([
            'TelopBarEffectClipCard',
            'SalmonRunPanelTimelyFixesCard',
            'JoinQueuePanelChallengeChecklistCard',
        ]);
        expect(screen.queryByText('ScoreDisplayPanel')).not.toBeInTheDocument();
    });
});
