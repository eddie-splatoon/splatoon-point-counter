import FlagRoundedIcon from '@mui/icons-material/FlagRounded';
import {render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';

import SectionTitle from './SectionTitle';

describe('SectionTitle', () => {
    it('shows the title with a decorative icon', () => {
        render(<SectionTitle icon={FlagRoundedIcon}>フォロワー目標</SectionTitle>);

        // 見出しの名前は文字だけ（アイコンは読み上げない）
        expect(screen.getByRole('heading', {name: 'フォロワー目標'})).toBeInTheDocument();
        expect(screen.getByTestId('FlagRoundedIcon')).toHaveAttribute('aria-hidden', 'true');
    });
});
