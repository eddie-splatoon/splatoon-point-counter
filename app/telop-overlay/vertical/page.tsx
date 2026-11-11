import TelopOverlay from '../../../components/TelopOverlay';

/** 縦型配信（1080x1920）用の実況テロップ。中身は /telop-overlay と同じで、画面の下のほうに出す */
export default function VerticalTelopOverlayPage() {
    return <TelopOverlay layout="portrait"/>;
}
