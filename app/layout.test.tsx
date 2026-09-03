import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import RootLayout from './layout';

// next/font is not available in the test environment.
vi.mock('next/font/google', () => ({
    Geist: () => ({ variable: '--font-geist-sans' }),
    Geist_Mono: () => ({ variable: '--font-geist-mono' }),
}));

// Rendering <html>/<body> through RTL produces invalid DOM nesting, so the
// provider is mocked to assert that the layout wraps its children with it.
const cacheProviderSpy = vi.fn();
vi.mock('@mui/material-nextjs/v16-appRouter', () => ({
    AppRouterCacheProvider: ({ children }: { children: React.ReactNode }) => {
        cacheProviderSpy();
        return <div data-testid="app-router-cache-provider">{children}</div>;
    },
}));

describe('RootLayout', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const renderLayout = () => {
        // Extract the <body> subtree so RTL does not nest <html> inside a <div>.
        const tree = RootLayout({ children: <span>child content</span> });
        const body = tree.props.children;
        return render(body.props.children);
    };

    it('wraps children with AppRouterCacheProvider so Emotion styles hydrate correctly', () => {
        renderLayout();

        expect(cacheProviderSpy).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId('app-router-cache-provider')).toBeInTheDocument();
    });

    it('renders the children inside the provider', () => {
        renderLayout();

        const provider = screen.getByTestId('app-router-cache-provider');
        expect(provider).toHaveTextContent('child content');
    });
});
