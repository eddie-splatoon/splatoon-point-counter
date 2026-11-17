// 配信コントロールパネルの MUI テーマ（キャンバス「デザインの決まり」と同じ値）
import {createTheme} from '@mui/material/styles';

export const tokens = {
    color: {
        background: '#0E1014',
        header: '#12151B',
        surface: '#161A21',
        surface2: '#1E232C',
        border: '#262B35',
        borderStrong: '#343B48',
        text: '#ECEEF2',
        textMuted: '#9AA3B2',
        primary: '#FF4F8B', onPrimary: '#1A0710', primarySoft: '#2A1720',
        success: '#3DDC84', onSuccess: '#062312', successSoft: '#163A26',
        warning: '#FFB547', onWarning: '#261600', warningSoft: '#241D12',
        error: '#FF6B6B', onError: '#2A0606',
        gold: '#FFC83D',
    },
    radius: {badge: 6, small: 8, control: 10, primary: 12, card: 14, pill: 999},
    space: [0, 4, 8, 12, 16, 20, 24, 32] as const,
    // ボタンの高さ。配信中の画面は live 以上
    height: {compact: 36, control: 40, live: 52, hero: 64},
} as const;

const c = tokens.color;

export const theme = createTheme({
    palette: {
        mode: 'dark',
        background: {default: c.background, paper: c.surface},
        primary: {main: c.primary, contrastText: c.onPrimary},
        success: {main: c.success, contrastText: c.onSuccess},
        warning: {main: c.warning, contrastText: c.onWarning},
        error: {main: c.error, contrastText: c.onError},
        text: {primary: c.text, secondary: c.textMuted},
        divider: c.border,
    },
    spacing: 4,
    shape: {borderRadius: tokens.radius.control},
    typography: {
        fontFamily: 'Inter, "Noto Sans JP", system-ui, sans-serif',
        fontSize: 14,
        h1: {fontSize: 20, fontWeight: 700},
        h2: {fontSize: 15, fontWeight: 700},
        body1: {fontSize: 14},
        body2: {fontSize: 13},
        caption: {fontSize: 12, color: c.textMuted},
        button: {fontWeight: 700, textTransform: 'none'},
    },
    components: {
        MuiCssBaseline: {
            styleOverrides: {body: {fontVariantNumeric: 'tabular-nums'}},
        },
        MuiPaper: {
            defaultProps: {elevation: 0},
            styleOverrides: {
                root: {backgroundImage: 'none', border: `1px solid ${c.border}`, borderRadius: tokens.radius.card},
            },
        },
        MuiButton: {
            defaultProps: {disableElevation: true},
            styleOverrides: {
                root: {minHeight: tokens.height.control, borderRadius: tokens.radius.control},
                sizeSmall: {minHeight: tokens.height.compact, borderRadius: tokens.radius.small},
                sizeLarge: {minHeight: tokens.height.live, borderRadius: tokens.radius.primary, fontSize: 16},
                outlined: {borderColor: c.borderStrong, color: c.text},
            },
        },
        MuiChip: {
            styleOverrides: {root: {borderRadius: tokens.radius.pill, fontWeight: 600}},
        },
        MuiOutlinedInput: {
            styleOverrides: {
                root: {backgroundColor: c.background, borderRadius: tokens.radius.control},
                notchedOutline: {borderColor: c.borderStrong},
            },
        },
    },
});
