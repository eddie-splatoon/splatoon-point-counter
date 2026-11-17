'use client';

import SidePanelSettingsPanel from '../../../components/SidePanelSettingsPanel';
import {BurndownSettingsCard, MessageSettingsCard, StreamSettingsGate} from '../../../components/StreamSettingsPanels';
import {useStreamSettings} from '../../../components/useStreamSettings';

/** 準備の画面（/control-panel/prepare）。配信の前に決めるもの（サイドパネル・メッセージ・バーンダウン） */
export default function PreparePage() {
    const state = useStreamSettings();
    return (
        <>
            <SidePanelSettingsPanel/>
            <StreamSettingsGate state={state}>
                {(settings) => (
                    <>
                        <MessageSettingsCard settings={settings} update={state.update}/>
                        <BurndownSettingsCard settings={settings} update={state.update}/>
                    </>
                )}
            </StreamSettingsGate>
        </>
    );
}
