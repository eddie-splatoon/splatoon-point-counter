import {notFound} from 'next/navigation';

import ControlPanelSettings from '../../../../components/ControlPanelSettings';
import {SETTINGS_SECTIONS} from '../sections';

/** 設定の画面（/control-panel/settings/[section]）。めったに触らないもの */
export default async function SettingsPage({params}: {params: Promise<{section: string}>}) {
    const {section} = await params;
    const known = SETTINGS_SECTIONS.find((s) => s.id === section);
    if (!known) notFound();
    return <ControlPanelSettings section={known.id}/>;
}
