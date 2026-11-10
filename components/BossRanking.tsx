/* eslint-disable @next/next/no-img-element -- 画像は外部（GitHub）にあり、next/image の最適化を通さずそのまま表示する */
'use client';

import React, {useState} from 'react';

import {SalmonBoss, bossImageUrl, findSalmonBoss} from '../lib/salmonBosses';
import {BossCount, BossRanking as BossRankingData} from '../lib/salmonTypes';

interface BossRankingProps {
    ranking: BossRankingData;
}

// 何位まで出すか
export const BOSS_RANKING_LIMIT = 3;
const RANK_COLORS = ['#FFD54A', '#CFD8DC', '#FFAB76'];
const ICON_SIZE = 30;

/** オオモノの画像。読み込めなければ（リンク切れ・オフライン）名前を文字で出す */
const BossIcon: React.FC<{boss: SalmonBoss}> = ({boss}) => {
    const [failed, setFailed] = useState(false);
    if (failed) {
        return (
            <span className="shrink-0 flex items-center justify-center text-center leading-none break-all"
                  style={{width: ICON_SIZE, height: ICON_SIZE, fontSize: 9}} data-testid="boss-name-fallback">
                {boss.name}
            </span>
        );
    }
    return (
        <img
            src={bossImageUrl(boss)}
            alt={boss.name}
            title={boss.name}
            width={ICON_SIZE}
            height={ICON_SIZE}
            className="shrink-0 object-contain"
            style={{width: ICON_SIZE, height: ICON_SIZE}}
            onError={() => setFailed(true)}
        />
    );
};

const RankingColumn: React.FC<{label: string; counts: BossCount[]; testId: string}> = ({label, counts, testId}) => {
    const rows = counts.flatMap((count) => {
        const boss = findSalmonBoss(count.boss);
        return boss ? [{boss, count}] : [];
    }).slice(0, BOSS_RANKING_LIMIT);
    return (
        <section className="flex-1 min-w-0" data-testid={testId}>
            <p className="text-center text-gray-400" style={{fontSize: '13px'}}>{label}</p>
            {rows.length === 0 ? (
                <p className="text-center text-gray-500" style={{fontSize: '16px'}}>-</p>
            ) : (
                <ol>
                    {rows.map(({boss, count}, i) => (
                        <li key={boss.key} className="flex items-center justify-center gap-1.5">
                            <span className="w-3 text-center font-bold tabular-nums" style={{color: RANK_COLORS[i], fontSize: '14px'}}>{i + 1}</span>
                            <BossIcon boss={boss}/>
                            <span className="w-7 text-right font-bold tabular-nums" style={{color: '#FF8A3D', fontSize: '20px'}}>
                                {count.selfKills}
                            </span>
                        </li>
                    ))}
                </ol>
            )}
        </section>
    );
};

/**
 * オオモノの自分の討伐数の TOP3（前回のバイトと本日のセッション）。サイドパネルのスロット（幅 250px）向け。
 * スケジュールと並べても下段に収まるよう、前回と本日を左右に並べ、名前は画像で表す
 */
const BossRanking: React.FC<BossRankingProps> = ({ranking}) => (
    <div className="w-[250px] max-w-full bg-black/80 text-white rounded-2xl shadow-2xl border-2 border-white/20 p-3"
         data-testid="boss-ranking">
        <p className="text-center font-bold" style={{color: '#FF6F00', fontSize: '20px'}}>オオモノ討伐TOP{BOSS_RANKING_LIMIT}</p>
        <div className="flex mt-1 divide-x divide-white/20">
            <RankingColumn label="前回" counts={ranking.lastJob} testId="boss-ranking-last-job"/>
            <RankingColumn label="本日" counts={ranking.session} testId="boss-ranking-session"/>
        </div>
    </div>
);

export default BossRanking;
