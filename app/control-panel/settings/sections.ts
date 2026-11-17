// 設定の画面のメニュー（URL は /control-panel/settings/<id>）。サーバー（ページ）とクライアント（メニュー）の両方から使うので
// 'use client' のファイルには置かない
export const SETTINGS_SECTIONS = [
    {id: 'telop', label: 'テロップと読み上げ'},
    {id: 'appearance', label: '見た目'},
    {id: 'obs', label: 'OBS のブラウザソース'},
] as const;

export type SettingsSectionId = typeof SETTINGS_SECTIONS[number]['id'];
