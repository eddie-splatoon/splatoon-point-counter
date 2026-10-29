import React from 'react';

import {SalmonJob, SalmonTotals} from '../lib/salmonTypes';

interface SalmonStatsProps {
    lastJob: SalmonJob | null;
    totals: SalmonTotals;
    // スケジュールのカードがルール名（サーモンランなど）を出すので、こちらは「戦績」と名付けて区別する
    title?: string;
}

const ROWS: {key: 'goldenEggs' | 'bossKills' | 'deaths'; label: string; color: string}[] = [
    {key: 'goldenEggs', label: '金イクラ', color: '#FFD54A'},
    {key: 'bossKills', label: 'オオモノ', color: '#FF8A3D'},
    {key: 'deaths', label: 'デス', color: '#B0BEC5'},
];

const resultLabel = (job: SalmonJob) => (job.cleared ? 'クリア' : `WAVE${job.waveReached} 失敗`);

/** サーモンランの「前回」と「本日（セッション）合計」。サイドパネルのスロット（幅 250px）向け */
const SalmonStats: React.FC<SalmonStatsProps> = ({lastJob, totals, title = '本日の戦績'}) => (
    <div className="w-[250px] max-w-full bg-black/80 text-white rounded-2xl shadow-2xl border-2 border-white/20 p-3"
         data-testid="salmon-stats">
        <p className="text-center font-bold" style={{color: '#FF6F00', fontSize: '20px'}}>{title}</p>

        <table className="w-full mt-1" style={{fontSize: '18px'}}>
            <thead>
            <tr className="text-gray-400" style={{fontSize: '13px'}}>
                <th/>
                <th className="text-right font-normal">前回</th>
                <th className="text-right font-normal">本日</th>
            </tr>
            </thead>
            <tbody>
            {ROWS.map(({key, label, color}) => (
                <tr key={key}>
                    <th scope="row" className="text-left font-normal" style={{color}}>{label}</th>
                    <td className="text-right tabular-nums">{lastJob ? lastJob[key] : '-'}</td>
                    <td className="text-right tabular-nums font-bold">{totals[key].toLocaleString()}</td>
                </tr>
            ))}
            </tbody>
        </table>

        <div className="mt-2 pt-2 border-t border-white/20 flex justify-between items-baseline" style={{fontSize: '15px'}}>
            <span>
                <span style={{color: '#32E675'}}>{totals.clears}クリア</span>
                {' / '}
                <span className="text-gray-400">{totals.failures}失敗</span>
            </span>
            {lastJob && (
                <span className="text-gray-400" style={{fontSize: '12px'}}>
                    前回: {resultLabel(lastJob)}
                </span>
            )}
        </div>
    </div>
);

export default SalmonStats;
