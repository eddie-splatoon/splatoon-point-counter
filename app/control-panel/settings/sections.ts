// 設定の画面のメニュー（URL は /control-panel/settings/<id>。設計書 6 章）。サーバー（ページ）とクライアント（メニュー）の両方から使うので
// 'use client' のファイルには置かない
export const SETTINGS_SECTIONS = [
    {id: 'telop', label: 'テロップのプリセット'},
    {id: 'voice', label: '読み上げ（VOICEVOX）'},
    {id: 'stamps', label: '画面スタンプ'},
    {id: 'score', label: 'スコア表示の自動更新'},
    {id: 'appearance', label: '見た目'},
    {id: 'obs', label: 'OBS のブラウザソース'},
] as const;

export type SettingsSectionId = typeof SETTINGS_SECTIONS[number]['id'];
