import {Inter, JetBrains_Mono, Noto_Sans_JP} from 'next/font/google';

const inter = Inter({variable: '--font-inter', subsets: ['latin']});
// 日本語は unicode-range で分割されたものを使う分だけ読み込むので、preload はしない
const notoSansJp = Noto_Sans_JP({variable: '--font-noto-sans-jp', weight: ['400', '500', '700'], preload: false});
const jetBrainsMono = JetBrains_Mono({variable: '--font-jetbrains-mono', subsets: ['latin'], weight: ['500', '700']});

// コントロールパネルのフォント（テーマの fontFamily が CSS 変数で参照する）
export default function ControlPanelLayout({children}: Readonly<{children: React.ReactNode}>) {
    return (
        <div className={`${inter.variable} ${notoSansJp.variable} ${jetBrainsMono.variable}`}>
            {children}
        </div>
    );
}
