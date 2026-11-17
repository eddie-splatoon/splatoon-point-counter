import {Box} from '@mui/material';

import ChallengeChecklistCard from '../../components/ChallengeChecklistCard';
import EffectClipCard from '../../components/EffectClipCard';
import JoinQueuePanel from '../../components/JoinQueuePanel';
import SalmonRunPanel from '../../components/SalmonRunPanel';
import TelopBar from '../../components/TelopBar';
import TimelyFixesCard from '../../components/TimelyFixesCard';

const columnSx = {flex: '1 1 380px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4} as const;

/**
 * 配信中の画面（/control-panel）。配信中に押すものだけを 3 列のカードに並べる（1280×900 でスクロールせずに全部見える）。
 * DOM の順番が、狭い幅で縦に並ぶ順番（= 優先度）
 */
export default function LivePage() {
    return (
        <Box sx={{display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 4}}>
            <Box sx={columnSx}>
                <TelopBar/>
                <EffectClipCard/>
            </Box>
            <Box sx={columnSx}>
                <SalmonRunPanel/>
                <TimelyFixesCard/>
            </Box>
            <Box sx={{...columnSx, flexBasis: 340}}>
                <JoinQueuePanel/>
                <ChallengeChecklistCard/>
            </Box>
        </Box>
    );
}
