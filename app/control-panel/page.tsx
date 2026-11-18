'use client';

import {Box} from '@mui/material';

import ChallengeChecklistCard from '../../components/ChallengeChecklistCard';
import {CompactLive, useCompactAfterMount} from '../../components/compactLayout';
import EffectClipCard from '../../components/EffectClipCard';
import JoinQueuePanel from '../../components/JoinQueuePanel';
import SalmonRunPanel from '../../components/SalmonRunPanel';
import TelopBar from '../../components/TelopBar';
import TimelyFixesCard from '../../components/TimelyFixesCard';

const columnSx = {flex: '1 1 380px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4} as const;

/**
 * 配信中の画面（/control-panel）。配信中に押すものだけを 3 列のカードに並べる（1280×900 でスクロールせずに全部見える）。
 * DOM の順番が、狭い幅で縦に並ぶ順番（= 優先度）。
 * 幅 600px 未満はコンパクト表示: テロップ（先頭 10 個）→ サーモンラン（取り込み・手入力・戦績 1 行）→ 視聴者参加（受付中だけ）→ 本日のお題。
 * 残り（ほかのテロップ・エフェクト・クリップ・記録の一覧・ときどき直すもの・列の一覧・キケン度・お知らせ）は最後の折りたたみ 1 つ
 */
export default function LivePage() {
    // 幅が変わって 600px をまたぐと、カードは作り直される（開いていたダイアログは閉じる。取り込みの進み具合は SalmonRunPanel が読み直す）
    const compact = useCompactAfterMount();
    if (compact === null) return null;
    if (compact) {
        return (
            <CompactLive
                renderFold={(slot) => (
                    <>
                        {slot('telop')}
                        <EffectClipCard/>
                        {slot('salmon')}
                        <TimelyFixesCard/>
                        {slot('join')}
                    </>
                )}
            >
                <TelopBar/>
                <SalmonRunPanel/>
                <JoinQueuePanel/>
                <ChallengeChecklistCard/>
            </CompactLive>
        );
    }
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
