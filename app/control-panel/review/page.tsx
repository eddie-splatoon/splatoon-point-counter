import {JoinHistoryCard} from '../../../components/JoinQueuePanel';
import SalmonPastSessionsCard from '../../../components/SalmonPastSessionsCard';
import {ScreenStampHistoryCard} from '../../../components/ScreenStampSettingsPanel';
import WeaponCardPanel from '../../../components/WeaponCardPanel';

/**
 * 振り返りの画面（/control-panel/review。設計書 5 章）。配信の後に使うカードを、今の見た目のまま縦に並べる:
 * 振り返りの画像 → 過去のセッション（どちらも SalmonPastSessionsCard。画像は選んだセッション）→ ブキ埋め（画像・新しいカード）→ これまでの受付 → 画面スタンプの集計
 */
export default function ReviewPage() {
    return (
        <>
            <SalmonPastSessionsCard/>
            <WeaponCardPanel/>
            <JoinHistoryCard/>
            <ScreenStampHistoryCard/>
        </>
    );
}
