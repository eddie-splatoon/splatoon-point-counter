/* eslint-disable @next/next/no-img-element -- 画像は外部 API の署名付き URL で、期限付きのため next/image の最適化を通さずそのまま表示する */
import React from 'react';

import {SALMON_SCHEDULE_KIND_LABELS, SalmonScheduleEntry, formatRemaining} from '../lib/salmonSchedule';

interface SalmonScheduleProps {
    schedule: SalmonScheduleEntry | null;
    now: number;
}

const KIND_COLORS: Record<SalmonScheduleEntry['kind'], string> = {
    regular: '#FF6F00',
    bigRun: '#B05CFF',
    teamContest: '#00C2FF',
};

/** いま開催中のサーモンランのステージ・支給ブキ・残り時間。サイドパネルのスロット（幅 250px）向け */
const SalmonSchedule: React.FC<SalmonScheduleProps> = ({schedule, now}) => {
    if (!schedule) {
        return (
            <div className="w-[250px] max-w-full bg-black/80 text-gray-400 rounded-2xl border-2 border-white/20 p-3 text-center" data-testid="salmon-schedule">
                スケジュールを取得できません
            </div>
        );
    }

    return (
        <div className="w-[250px] max-w-full bg-black/80 text-white rounded-2xl shadow-2xl border-2 border-white/20 p-3" data-testid="salmon-schedule">
            <div className="flex justify-between items-baseline">
                <p className="font-bold" style={{color: KIND_COLORS[schedule.kind], fontSize: '18px'}}>{SALMON_SCHEDULE_KIND_LABELS[schedule.kind]}</p>
                <p className="text-gray-300 tabular-nums" style={{fontSize: '13px'}}>{formatRemaining(schedule.endTime, now)}</p>
            </div>
            <div className="relative mt-1 rounded-lg overflow-hidden" style={{height: 90}}>
                <img src={schedule.stage.image} alt="" className="w-full h-full object-cover"/>
                <p className="absolute left-0 right-0 bottom-0 px-2 py-0.5 bg-black/60 font-bold" style={{fontSize: '15px'}}>
                    {schedule.stage.name}
                </p>
            </div>
            <ul className="mt-2 flex justify-between" aria-label="支給ブキ">
                {schedule.weapons.map((weapon, i) => (
                    <li key={i} className="w-[50px] h-[50px] rounded-full bg-white/10 flex items-center justify-center">
                        <img src={weapon.image} alt={weapon.name} title={weapon.name} className="w-[44px] h-[44px] object-contain"/>
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default SalmonSchedule;
