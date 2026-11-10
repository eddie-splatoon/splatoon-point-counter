'use client';

import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import {
    Button,
    Box,
    IconButton,
    Typography,
} from '@mui/material';
import {createTheme, ThemeProvider} from '@mui/material/styles';
import Image from 'next/image';
import React from 'react';

const darkTheme = createTheme({
    palette: {
        mode: 'dark',
        primary: {
            main: '#FF40A0',
        },
        secondary: {
            main: '#32E675',
        },
        text: {
            primary: '#FFFFFF',
            secondary: 'rgba(255, 255, 255, 0.7)',
        },
        background: {
            paper: 'rgba(255, 255, 255, 0.05)',
            default: '#121212',
        },
    },
    components: {
        MuiOutlinedInput: {
            styleOverrides: {
                root: {
                    '& .MuiOutlinedInput-notchedOutline': {
                        borderColor: 'rgba(255, 255, 255, 0.2)',
                    },
                    '&:hover .MuiOutlinedInput-notchedOutline': {
                        borderColor: 'rgba(255, 255, 255, 0.5)',
                    },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#FF40A0',
                    },
                    '& .MuiInputBase-input': {
                        color: '#FFFFFF',
                    },
                },
            },
        },
        MuiInputLabel: {
            styleOverrides: {
                root: {
                    color: 'rgba(255, 255, 255, 0.7)',
                    '&.Mui-focused': {
                        color: '#FF40A0',
                    },
                },
            },
        },
        MuiFormHelperText: {
            styleOverrides: {
                root: {
                    color: 'rgba(255, 255, 255, 0.5)',
                },
            },
        },
        MuiSelect: {
            styleOverrides: {
                icon: {
                    color: '#FFFFFF',
                },
            },
        },
        MuiPaper: {
            styleOverrides: {
                root: {
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                },
            },
        },
        MuiTab: {
            styleOverrides: {
                root: {
                    color: 'rgba(255, 255, 255, 0.7)',
                    '&.Mui-selected': {
                        color: '#FF40A0',
                    },
                },
            },
        },
        MuiTabs: {
            styleOverrides: {
                indicator: {
                    backgroundColor: '#FF40A0',
                },
            },
        },
        MuiButton: {
            styleOverrides: {
                root: {
                    variants: [
                        {
                            props: {variant: 'contained', color: 'primary'},
                            style: {
                                color: '#FFFFFF',
                                backgroundColor: '#FF40A0',
                                '&:hover': {
                                    backgroundColor: '#E6398D',
                                }
                            }
                        }
                    ]
                }
            }
        }
    },
});

interface OverlayPage {
    href: string;
    label: string;
    /** 映像の大きさ（px）。無ければ画面に何も出さないページ */
    size?: {width: number; height: number};
}

/** ランチャーに並べるオーバーレイ。オーバーレイを追加したらここに足す */
const OVERLAY_PAGES: OverlayPage[] = [
    {href: '/obs-overlay', label: 'スコア＆メッセージ', size: {width: 1450, height: 160}},
    {href: '/burndown-overlay', label: 'バーンダウンチャート', size: {width: 250, height: 584}},
    {href: '/caption-overlay', label: '字幕', size: {width: 1920, height: 1080}},
    {href: '/side-panel-overlay', label: 'サイドパネル', size: {width: 250, height: 584}},
    {href: '/side-panel-overlay/vertical', label: 'サイドパネル 縦型配信用', size: {width: 990, height: 440}},
    {href: '/telop-overlay', label: '実況テロップ', size: {width: 1920, height: 1080}},
    {href: '/weapon-card-overlay', label: 'ブキ埋めカード', size: {width: 620, height: 620}},
    {href: '/salmon-review-overlay', label: 'サーモンランの振り返り', size: {width: 1920, height: 1080}},
    // 埋め込むとランチャーを開いているだけで読み上げが鳴る（OBS と二重に鳴る）のでプレビューしない
    {href: '/voice-overlay', label: '読み上げ（音声専用）'},
];

const PREVIEW_WIDTH = 400;
const PREVIEW_HEIGHT = 225;

/** オーバーレイを iframe で開き、プレビュー枠に収まるよう縮小して表示する（クリックすると別タブで開く） */
function OverlayPreview({page}: {page: OverlayPage}) {
    const {size} = page;
    const scale = size ? Math.min(PREVIEW_WIDTH / size.width, PREVIEW_HEIGHT / size.height) : 1;
    return (
        <Box sx={{
            position: 'relative',
            width: PREVIEW_WIDTH,
            height: PREVIEW_HEIGHT,
            mx: 'auto',
            overflow: 'hidden',
            borderRadius: 1,
            // 透過のオーバーレイが見えるよう、OBS の配信画面に近い暗い市松模様にする
            backgroundColor: '#1e1e1e',
            backgroundImage: 'conic-gradient(#2a2a2a 25%, transparent 0 50%, #2a2a2a 0 75%, transparent 0)',
            backgroundSize: '20px 20px',
        }}>
            {size ? (
                <Box sx={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    width: size.width * scale,
                    height: size.height * scale,
                    transform: 'translate(-50%, -50%)',
                }}>
                    <iframe
                        // オーバーレイ側はプレビュー中だと分かるようにし、書き込みをしない（バーンダウンの花火の発火など）
                        src={`${page.href}?preview=1`}
                        title={`${page.label}のプレビュー`}
                        width={size.width}
                        height={size.height}
                        tabIndex={-1}
                        loading="lazy"
                        style={{border: 0, transform: `scale(${scale})`, transformOrigin: 'top left', pointerEvents: 'none', colorScheme: 'normal'}}
                    />
                </Box>
            ) : (
                <Typography variant="body2" sx={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'text.secondary'}}>
                    音声のみ（画面表示なし）
                </Typography>
            )}
            <Box
                component="a"
                href={page.href}
                target="_blank"
                rel="noopener noreferrer"
                tabIndex={-1}
                aria-hidden
                sx={{position: 'absolute', inset: 0}}
            />
        </Box>
    );
}

export default function Home() {
    return (
        <ThemeProvider theme={darkTheme}>
            <Box sx={{
                minHeight: '100vh',
                bgcolor: 'background.default',
                color: 'text.primary',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                p: 4,
                position: 'relative',
                overflow: 'hidden'
            }}>
                {/* Background Blobs for styling */}
                <Box sx={{position: 'absolute', top: '-200px', left: '-200px', width: '500px', height: '500px', bgcolor: 'primary.main', borderRadius: '50%', filter: 'blur(150px)', opacity: 0.3}}/>
                <Box sx={{position: 'absolute', bottom: '-250px', right: '-250px', width: '600px', height: '600px', bgcolor: 'secondary.main', borderRadius: '50%', filter: 'blur(150px)', opacity: 0.3}}/>

                <Box sx={{zIndex: 1, width: '100%', maxWidth: 1400}}>
                    <Box sx={{display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2, mb: 4}}>
                        <Image src="/favicon.svg" alt="App Icon" width={56} height={56}/>
                        <Typography variant="h4" component="h1" sx={{fontWeight: 'bold', flexGrow: 1}}>
                            OBS Overlay Launcher
                        </Typography>
                        <Button
                            variant="contained"
                            color="primary"
                            href="/control-panel"
                            target="_blank"
                            rel="noopener noreferrer"
                            size="large"
                            endIcon={<OpenInNewIcon/>}
                        >
                            コントロールパネル
                        </Button>
                    </Box>

                    <Box sx={{display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${PREVIEW_WIDTH + 24}px, 1fr))`, gap: 2}}>
                        {OVERLAY_PAGES.map((page) => (
                            <Box
                                key={page.href}
                                component="section"
                                sx={{
                                    p: 1.5,
                                    borderRadius: 2,
                                    bgcolor: 'background.paper',
                                    backdropFilter: 'blur(10px)',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                }}
                            >
                                <Box sx={{display: 'flex', alignItems: 'center', gap: 1, mb: 1}}>
                                    <Typography variant="subtitle1" component="h2" sx={{fontWeight: 'bold'}}>
                                        {page.label}
                                    </Typography>
                                    <Typography variant="caption" sx={{color: 'text.secondary', flexGrow: 1}}>
                                        {page.size ? `${page.size.width}×${page.size.height}` : ''}
                                    </Typography>
                                    <IconButton
                                        href={page.href}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        size="small"
                                        color="secondary"
                                        aria-label={`${page.label}を別タブで開く`}
                                    >
                                        <OpenInNewIcon fontSize="small"/>
                                    </IconButton>
                                </Box>
                                <OverlayPreview page={page}/>
                            </Box>
                        ))}
                    </Box>
                </Box>
                <Typography variant="caption" sx={{mt: 4, color: 'text.secondary', zIndex: 1}}>
                    © 2025 eddie-splatoon
                </Typography>
            </Box>
        </ThemeProvider>
    );
}
