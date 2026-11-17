import {Typography} from '@mui/material';

import WeaponCardPanel from '../../../components/WeaponCardPanel';

/** 振り返りの画面（/control-panel/review）。配信の後に使うもの */
export default function ReviewPage() {
    return (
        <>
            <WeaponCardPanel/>
            <Typography variant="body2" sx={{color: 'text.secondary'}}>
                サーモンランの振り返りの画像と過去のセッションは、いまは配信中の画面のサーモンランのカードにあります。
            </Typography>
        </>
    );
}
