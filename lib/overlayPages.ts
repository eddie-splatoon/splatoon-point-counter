// オーバーレイのページと、OBS のブラウザソースに設定する大きさ。ランチャー（app/page.tsx）と設定の画面の両方から使う

export interface OverlayPage {
    href: string;
    label: string;
    /** 映像の大きさ（px）。無ければ画面に何も出さないページ */
    size?: {width: number; height: number};
}

/** オーバーレイの一覧（ランチャー・設定の「OBS のブラウザソース」）。オーバーレイを追加したらここに足す */
export const OVERLAY_PAGES: OverlayPage[] = [
    {href: '/obs-overlay', label: 'スコア＆メッセージ', size: {width: 1450, height: 160}},
    {href: '/burndown-overlay', label: 'バーンダウンチャート', size: {width: 250, height: 584}},
    {href: '/caption-overlay', label: '字幕', size: {width: 1920, height: 1080}},
    {href: '/side-panel-overlay', label: 'サイドパネル', size: {width: 250, height: 584}},
    {href: '/side-panel-overlay/vertical', label: 'サイドパネル 縦型配信用', size: {width: 990, height: 440}},
    {href: '/telop-overlay', label: '実況テロップ', size: {width: 1920, height: 1080}},
    {href: '/telop-overlay/vertical', label: '実況テロップ 縦型配信用', size: {width: 1080, height: 1920}},
    {href: '/weapon-card-overlay', label: 'ブキ埋めカード', size: {width: 620, height: 620}},
    {href: '/salmon-review-overlay', label: 'サーモンランの振り返り', size: {width: 1920, height: 1080}},
    {href: '/salmon-review-overlay/vertical', label: 'サーモンランの振り返り 縦型配信用', size: {width: 1080, height: 1920}},
    {href: '/join-queue-overlay', label: '視聴者参加の受付', size: {width: 420, height: 600}},
    {href: '/break-overlay', label: '休憩中', size: {width: 1920, height: 1080}},
    {href: '/break-overlay/vertical', label: '休憩中 縦型配信用', size: {width: 1080, height: 1920}},
    // 埋め込むとランチャーを開いているだけで読み上げが鳴る（OBS と二重に鳴る）のでプレビューしない
    {href: '/voice-overlay', label: '読み上げ（音声専用）'},
];
