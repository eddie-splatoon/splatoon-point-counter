import {Box} from '@mui/material';

import ClipPanel from '../../components/ClipPanel';
import JoinQueuePanel from '../../components/JoinQueuePanel';
import SalmonRunPanel from '../../components/SalmonRunPanel';
import ScoreDisplayPanel from '../../components/ScoreDisplayPanel';
import {EffectButtonsCard} from '../../components/StreamSettingsPanels';
import TelopBar from '../../components/TelopBar';

/**
 * 配信中の画面（/control-panel）。配信中に押すものを置く。
 * 並べ方（3 列のカード・狭い幅の表示）は #129・#133 で作り直す。ここではタブだった中身を並べているだけ
 */
export default function LivePage() {
    return (
        <>
            <TelopBar/>
            <EffectButtonsCard/>
            <SalmonRunPanel/>
            <JoinQueuePanel/>
            <ClipPanel/>
            <Box sx={{mb: 4}}>
                <ScoreDisplayPanel/>
            </Box>
        </>
    );
}
