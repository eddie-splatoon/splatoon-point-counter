import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import {Dialog, DialogContent, DialogTitle, IconButton} from '@mui/material';
import React from 'react';

import {tokens} from '../app/control-panel/theme';

interface LiveDialogProps {
    open: boolean;
    onClose: () => void;
    title: string;
    maxWidth?: 'xs' | 'sm' | 'md';
    children: React.ReactNode;
    actions?: React.ReactNode;
}

/** 配信中の画面で、ときどき使うもの（手入力・履歴・修正）を開くダイアログ。右上の × で閉じる */
const LiveDialog: React.FC<LiveDialogProps> = ({open, onClose, title, maxWidth = 'sm', children, actions}) => (
    <Dialog
        open={open}
        onClose={onClose}
        fullWidth
        maxWidth={maxWidth}
        slotProps={{paper: {sx: {bgcolor: 'background.paper', borderRadius: `${tokens.radius.card + 2}px`}}}}
    >
        <DialogTitle sx={{display: 'flex', alignItems: 'center', gap: 2, fontSize: 18, fontWeight: 700, pr: 3}}>
            <span style={{flex: 1}}>{title}</span>
            <IconButton onClick={onClose} aria-label="閉じる" size="small"><CloseRoundedIcon/></IconButton>
        </DialogTitle>
        <DialogContent>{children}</DialogContent>
        {actions}
    </Dialog>
);

export default LiveDialog;
