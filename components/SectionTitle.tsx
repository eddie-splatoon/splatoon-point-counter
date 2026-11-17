import {Typography} from '@mui/material';
import React from 'react';

import type {SvgIconComponent} from '@mui/icons-material';

interface SectionTitleProps {
    icon: SvgIconComponent;
    children: React.ReactNode;
}

// コントロールパネルのカードの見出し（アイコン + 文字）。見出しに絵文字は使わない
const SectionTitle = ({icon: Icon, children}: SectionTitleProps) => (
    <Typography variant="h6" gutterBottom sx={{display: 'flex', alignItems: 'center', gap: 2}}>
        <Icon fontSize="small" sx={{color: 'text.secondary'}} aria-hidden/>
        {children}
    </Typography>
);

export default SectionTitle;
