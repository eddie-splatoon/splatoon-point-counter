import {redirect} from 'next/navigation';

import {SETTINGS_SECTIONS} from './sections';

// 設定の画面は、最初のメニューを開く
export default function SettingsIndexPage() {
    redirect(`/control-panel/settings/${SETTINGS_SECTIONS[0].id}`);
}
