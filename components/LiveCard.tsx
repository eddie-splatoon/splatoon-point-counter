import {Box, Paper, Typography} from '@mui/material';
import React, {useId} from 'react';

import type {SvgIconComponent} from '@mui/icons-material';
import type {SxProps, Theme} from '@mui/material';

interface LiveCardProps {
    icon: SvgIconComponent;
    title: string;
    /** 見出しの右（補足・チップ・小さいボタン） */
    aside?: React.ReactNode;
    /** 見出しを画面に出さない（読み上げだけ） */
    hideTitle?: boolean;
    sx?: SxProps<Theme>;
    children: React.ReactNode;
}

// sx の width: 1 は 100% になるので、px で書く
const visuallyHidden = {position: 'absolute', width: '1px', height: '1px', margin: '-1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap'} as const;

/** 配信中・準備の画面のカード（見出し + 右の補足）。見出しは section の名前になる */
const LiveCard: React.FC<LiveCardProps> = ({icon: Icon, title, aside, hideTitle = false, sx, children}) => {
    const id = useId();
    return (
        <Paper component="section" aria-labelledby={id} sx={[{p: 4}, ...(Array.isArray(sx) ? sx : [sx])]}>
            {hideTitle ? (
                <Typography id={id} variant="h2" sx={visuallyHidden}>{title}</Typography>
            ) : (
                <Box sx={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 3, minHeight: 28}}>
                    <Typography id={id} variant="h2" sx={{display: 'flex', alignItems: 'center', gap: 2}}>
                        <Icon fontSize="small" sx={{color: 'text.secondary'}} aria-hidden/>
                        {title}
                    </Typography>
                    {aside}
                </Box>
            )}
            {children}
        </Paper>
    );
};

/** 見出しの右の小さい補足 */
export const LiveCardNote: React.FC<{children: React.ReactNode}> = ({children}) => (
    <Typography variant="caption" sx={{color: 'text.secondary', textAlign: 'right'}}>{children}</Typography>
);

export default LiveCard;
