'use client';

import {Box} from '@mui/material';

import ChallengeEditorCard from '../../../components/ChallengeEditorCard';
import {JoinStreamerRatingCard} from '../../../components/JoinQueuePanel';
import SidePanelSettingsPanel from '../../../components/SidePanelSettingsPanel';
import {MessageBurndownCard, StreamSettingsGate} from '../../../components/StreamSettingsPanels';
import StreamStartCard from '../../../components/StreamStartCard';
import {useSidePanelSettings} from '../../../components/useSidePanelSettings';
import {useStreamSettings} from '../../../components/useStreamSettings';

const columnSx = {flex: '1 1 420px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4} as const;

/**
 * 準備の画面（/control-panel/prepare。設計書 4 章）。配信の前に決めるものを 2 列に並べる。
 * 左: 今日の配信（配信を始める）・本日のお題 / 右: サイドパネル・参加型の準備・流すメッセージ・バーンダウン。
 * お題とサイドパネルは同じ設定（/api/side-panel）なので、useSidePanelSettings を 1 回だけ使って両方に渡す
 */
export default function PreparePage() {
    const streamSettings = useStreamSettings();
    const sidePanel = useSidePanelSettings();
    return (
        <Box sx={{display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 4}}>
            <Box sx={columnSx}>
                <StreamStartCard/>
                <ChallengeEditorCard state={sidePanel}/>
            </Box>
            <Box sx={columnSx}>
                <SidePanelSettingsPanel state={sidePanel}/>
                <JoinStreamerRatingCard/>
                <StreamSettingsGate state={streamSettings}>
                    {(settings) => <MessageBurndownCard settings={settings} update={streamSettings.update}/>}
                </StreamSettingsGate>
            </Box>
        </Box>
    );
}
