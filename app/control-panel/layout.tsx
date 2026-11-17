import {Inter, JetBrains_Mono, Noto_Sans_JP} from 'next/font/google';

import ControlPanelShell from '../../components/ControlPanelShell';

const inter = Inter({subsets: ['latin']});
// 日本語は unicode-range で分割されたものを使う分だけ読み込むので、preload はしない
const notoSansJp = Noto_Sans_JP({weight: ['400', '500', '700'], preload: false});
const jetBrainsMono = JetBrains_Mono({subsets: ['latin'], weight: ['500', '700']});

// テーマの fontFamily が参照する CSS 変数。プルダウンのメニューやダイアログは body の直下に出るので、
// ページを包む要素ではなく :root に置く（値は next/font が決めるフォント名だけで、外からの入力は入らない）
const fontVariables = `:root{--font-inter:${inter.style.fontFamily};--font-noto-sans-jp:${notoSansJp.style.fontFamily};--font-jetbrains-mono:${jetBrainsMono.style.fontFamily}}`;

// コントロールパネルのフォントと、全画面（準備・配信中・振り返り・設定）に共通の外枠
export default function ControlPanelLayout({children}: Readonly<{children: React.ReactNode}>) {
    return (
        <>
            <style>{fontVariables}</style>
            <ControlPanelShell>{children}</ControlPanelShell>
        </>
    );
}
