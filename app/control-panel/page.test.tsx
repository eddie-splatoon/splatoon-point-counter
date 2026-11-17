import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import LivePage from './page';

// 各カードは独自に API を呼ぶ（中身はそれぞれのテスト）。ここでは配信中の画面の並びだけを確認する
vi.mock('../../components/TelopBar', () => ({ default: () => <div>TelopBar</div> }));
vi.mock('../../components/EffectClipCard', () => ({ default: () => <div>EffectClipCard</div> }));
vi.mock('../../components/SalmonRunPanel', () => ({ default: () => <div>SalmonRunPanel</div> }));
vi.mock('../../components/TimelyFixesCard', () => ({ default: () => <div>TimelyFixesCard</div> }));
vi.mock('../../components/JoinQueuePanel', () => ({ default: () => <div>JoinQueuePanel</div> }));
vi.mock('../../components/ChallengeChecklistCard', () => ({ default: () => <div>ChallengeChecklistCard</div> }));

describe('LivePage', () => {
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
