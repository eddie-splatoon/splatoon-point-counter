'use client';

import {JoinStreamerRatingCard} from '../../../components/JoinQueuePanel';
import SalmonSessionStartCard from '../../../components/SalmonSessionStartCard';
import SidePanelSettingsPanel from '../../../components/SidePanelSettingsPanel';
import {BurndownSettingsCard, MessageSettingsCard, StreamSettingsGate} from '../../../components/StreamSettingsPanels';
import {useStreamSettings} from '../../../components/useStreamSettings';

/** 準備の画面（/control-panel/prepare）。配信の前に決めるもの（サーモンランのセッション・サイドパネル・メッセージ・バーンダウン・配信者の評価）。並べ方は #130 で作り直す */
export default function PreparePage() {
    const state = useStreamSettings();
    return (
        <>
            <SalmonSessionStartCard/>
            <SidePanelSettingsPanel/>
            <StreamSettingsGate state={state}>
                {(settings) => (
                    <>
                        <MessageSettingsCard settings={settings} update={state.update}/>
                        <BurndownSettingsCard settings={settings} update={state.update}/>
                    </>
                )}
            </StreamSettingsGate>
            <JoinStreamerRatingCard/>
        </>
    );
}
