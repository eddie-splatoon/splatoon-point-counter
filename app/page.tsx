'use client';

import {
    Button,
    Box,
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
                containedPrimary: {
                    color: '#FFFFFF',
                    backgroundColor: '#FF40A0',
                    '&:hover': {
                        backgroundColor: '#E6398D',
                    }
                }
            }
        }
    },
});

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
                justifyContent: 'center',
                p: 4,
                position: 'relative',
                overflow: 'hidden'
            }}>
                {/* Background Blobs for styling */}
                <Box sx={{position: 'absolute', top: '-200px', left: '-200px', width: '500px', height: '500px', bgcolor: 'primary.main', borderRadius: '50%', filter: 'blur(150px)', opacity: 0.3}}/>
                <Box sx={{position: 'absolute', bottom: '-250px', right: '-250px', width: '600px', height: '600px', bgcolor: 'secondary.main', borderRadius: '50%', filter: 'blur(150px)', opacity: 0.3}}/>

                <Box sx={{
                    zIndex: 1,
                    textAlign: 'center',
                    maxWidth: 700,
                    width: '100%',
                    p: 3,
                    borderRadius: 2,
                    bgcolor: 'background.paper',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    boxShadow: '0 4px 30px rgba(0, 0, 0, 0.1)'
                }}>
                    <Image src="/favicon.svg" alt="App Icon" width={80} height={80} style={{marginBottom: '16px'}}/>
                    <Typography variant="h3" component="h1" gutterBottom sx={{fontWeight: 'bold', mb: 4}}>
                        OBS Overlay Launcher
                    </Typography>

                    <Box sx={{display: 'flex', flexDirection: 'column', gap: 2}}>
                        <Button
                            variant="contained"
                            color="primary"
                            href="/control-panel"
                            target="_blank"
                            rel="noopener noreferrer"
                            fullWidth
                            size="large"
                        >
                            コントロールパネル
                        </Button>
                        <Button
                            variant="contained"
                            color="secondary"
                            href="/obs-overlay"
                            target="_blank"
                            rel="noopener noreferrer"
                            fullWidth
                            size="large"
                        >
                            スコア＆メッセージオーバーレイ (Preview)
                        </Button>
                        <Button
                            variant="contained"
                            color="secondary"
                            href="/burndown-overlay"
                            target="_blank"
                            rel="noopener noreferrer"
                            fullWidth
                            size="large"
                        >
                            バーンダウンチャートオーバーレイ (Preview)
                        </Button>
                    </Box>
                </Box>
                <Typography variant="caption" sx={{mt: 4, color: 'text.secondary', zIndex: 1}}>
                    © 2025 eddie-splatoon
                </Typography>
            </Box>
        </ThemeProvider>
    );
}