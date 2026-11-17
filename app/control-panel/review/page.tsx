import {JoinHistoryCard} from '../../../components/JoinQueuePanel';
import SalmonPastSessionsCard from '../../../components/SalmonPastSessionsCard';
import WeaponCardPanel from '../../../components/WeaponCardPanel';

/** 振り返りの画面（/control-panel/review）。配信の後に使うもの（並べ方は #131 で作り直す） */
export default function ReviewPage() {
    return (
        <>
            <SalmonPastSessionsCard/>
            <WeaponCardPanel/>
            <JoinHistoryCard/>
        </>
    );
}
