/* eslint-disable @next/next/no-img-element -- 画像は外部（GitHub）にあり、next/image の最適化を通さずそのまま表示する */
'use client';

import {motion} from 'motion/react';
import React, {useState} from 'react';

import {bossImageUrl, findSalmonBoss} from '../lib/salmonBosses';
import {SalmonReviewJob, SalmonSessionReview} from '../lib/salmonTypes';
import {findSalmonWeapon} from '../lib/salmonWeapons';

import WeaponIcon from './WeaponIcon';

// 配信画面（暗い背景の上）に出すので、ダークの配色だけを使う（dataviz スキルの既定パレットのダーク側）。
// クリア / 失敗はどのグラフでも同じ色（青 / オレンジ。色覚の違いでも見分けられることを検証済み）
const INK = {primary: '#f0efec', secondary: '#c3c2b7', muted: '#898781', grid: '#2c2c2a', baseline: '#383835'};
const CLEARED = '#3987e5';
const FAILED = '#d95926';
const BOSS_BAR = '#199e70'; // オオモノの討伐数（1 系列なので凡例は付けない）
const SURFACE = 'rgba(26, 26, 25, 0.92)';

// ブキ埋めカードで新しく埋まったブキのアイコンは 1 行分まで（数は「+n」で全部出す）
const NEW_WEAPON_ICON_LIMIT = 8;

export const REVIEW_WIDTH = 1920;
export const REVIEW_HEIGHT = 1080;

interface SalmonReviewProps {
    review: SalmonSessionReview;
}

/** 開いたときに上から順にカードを出す（ポーリングで再生し直さないよう、初回の表示だけ） */
const Card: React.FC<{title: string; order: number; className?: string; children: React.ReactNode; testId?: string}> = (
    {title, order, className, children, testId},
) => (
    <motion.section
        className={`rounded-2xl p-5 flex flex-col min-h-0 ${className ?? ''}`}
        style={{backgroundColor: SURFACE, border: '1px solid rgba(255,255,255,0.10)'}}
        initial={{opacity: 0, y: 24}}
        animate={{opacity: 1, y: 0}}
        transition={{duration: 0.5, delay: 0.15 * order}}
        data-testid={testId}
    >
        <h2 className="font-bold mb-3" style={{fontSize: 24, color: INK.secondary}}>{title}</h2>
        {children}
    </motion.section>
);

const StatTile: React.FC<{label: string; value: string; note?: string}> = ({label, value, note}) => (
    <div className="flex flex-col" data-testid="review-stat">
        <span style={{fontSize: 18, color: INK.muted}}>{label}</span>
        <span className="font-bold leading-tight" style={{fontSize: 44, color: INK.primary}}>{value}</span>
        {note && <span style={{fontSize: 15, color: INK.muted}}>{note}</span>}
    </div>
);

const LegendKey: React.FC<{color: string; label: string}> = ({color, label}) => (
    <span className="inline-flex items-center gap-1.5" style={{fontSize: 16, color: INK.secondary}}>
        <span className="inline-block rounded-sm" style={{width: 12, height: 12, backgroundColor: color}}/>
        {label}
    </span>
);

/** 目盛りをきりのいい数にする（0 / 10 / 20 …） */
export function niceTicks(max: number, count = 4): number[] {
    if (max <= 0) return [0];
    const rough = max / count;
    const magnitude = 10 ** Math.floor(Math.log10(rough));
    // 金イクラなどは整数なので、目盛りの間隔は 1 以上（0.5 などにしない）
    const step = Math.max(1, [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? 10 * magnitude);
    const ticks = [];
    for (let v = 0; v <= max + step / 2 && ticks.length <= count + 1; v += step) ticks.push(v);
    if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
    return ticks;
}

/** バイトごとの金イクラ（縦棒。クリア / 失敗で色分けし、最多のバイトにだけ値を出す） */
const GoldenEggsChart: React.FC<{jobs: SalmonReviewJob[]; bestJobId: number | null}> = ({jobs, bestJobId}) => {
    const width = 1080;
    const height = 175;
    const left = 44;
    const bottom = 28;
    const top = 26;
    const plotWidth = width - left;
    const plotHeight = height - bottom - top;
    const ticks = niceTicks(Math.max(0, ...jobs.map((j) => j.goldenEggs)));
    const max = ticks[ticks.length - 1] || 1;
    const slot = plotWidth / Math.max(jobs.length, 1);
    const barWidth = Math.min(24, slot * 0.6);
    const y = (v: number) => top + plotHeight - (v / max) * plotHeight;
    // 番号はバイトが多いと重なるので間引く
    const labelEvery = Math.ceil(jobs.length / 20);
    return (
        <svg width={width} height={height} role="img" aria-label="バイトごとの金イクラ" data-testid="review-golden-eggs-chart">
            {ticks.map((t) => (
                <g key={t}>
                    <line x1={left} x2={width} y1={y(t)} y2={y(t)} stroke={t === 0 ? INK.baseline : INK.grid} strokeWidth={1}/>
                    <text x={left - 8} y={y(t) + 5} textAnchor="end" fontSize={14} fill={INK.muted} style={{fontVariantNumeric: 'tabular-nums'}}>{t}</text>
                </g>
            ))}
            {jobs.map((job, i) => {
                const x = left + slot * i + (slot - barWidth) / 2;
                const h = Math.max(0, y(0) - y(job.goldenEggs));
                const r = Math.min(4, barWidth / 2, h);
                // 上の角だけ丸め、根元（0 の線）は四角のまま
                const path = `M${x},${y(0)} V${y(0) - h + r} Q${x},${y(0) - h} ${x + r},${y(0) - h} H${x + barWidth - r} Q${x + barWidth},${y(0) - h} ${x + barWidth},${y(0) - h + r} V${y(0)} Z`;
                return (
                    <g key={job.id} data-testid="review-job-bar" data-cleared={job.cleared}>
                        {h > 0 && <path d={path} fill={job.cleared ? CLEARED : FAILED}/>}
                        {job.id === bestJobId && (
                            <text x={x + barWidth / 2} y={y(job.goldenEggs) - 8} textAnchor="middle" fontSize={16} fontWeight="bold" fill={INK.primary}>
                                {job.goldenEggs}
                            </text>
                        )}
                        {(i % labelEvery === 0 || i === jobs.length - 1) && (
                            <text x={x + barWidth / 2} y={height - 6} textAnchor="middle" fontSize={14} fill={INK.muted}>{i + 1}</text>
                        )}
                    </g>
                );
            })}
        </svg>
    );
};

/** クリア / 失敗の内訳（1 本の帯。幅は回数に比例し、ブロックに回数を書く） */
const OutcomeBar: React.FC<{clears: number; waveFailures: number[]}> = ({clears, waveFailures}) => {
    const failures = waveFailures.reduce((sum, n) => sum + n, 0);
    const total = clears + failures;
    if (total === 0) return null;
    const parts = [
        {label: 'クリア', value: clears, color: CLEARED},
        {label: '失敗', value: failures, color: FAILED},
    ].filter((p) => p.value > 0);
    return (
        <div data-testid="review-outcome">
            <div className="flex w-full gap-[2px]" style={{height: 28}}>
                {parts.map((p) => (
                    <div key={p.label} className="rounded flex items-center px-2 font-bold text-white"
                         style={{width: `${(p.value / total) * 100}%`, backgroundColor: p.color, fontSize: 16}}>
                        {p.value / total >= 0.12 ? p.value : ''}
                    </div>
                ))}
            </div>
            <div className="flex gap-4 mt-2">
                {parts.map((p) => <LegendKey key={p.label} color={p.color} label={`${p.label} ${p.value}`}/>)}
            </div>
            {failures > 0 && (
                <p className="mt-2" style={{fontSize: 16, color: INK.secondary}}>
                    失敗した WAVE: {waveFailures.map((n, i) => `W${i + 1} ${n} 回`).join(' / ')}
                </p>
            )}
        </div>
    );
};

const BossImage: React.FC<{name: string; image: string}> = ({name, image}) => {
    const [failed, setFailed] = useState(false);
    if (failed) return <span className="shrink-0" style={{width: 28, height: 28}}/>;
    return <img src={image} alt="" width={28} height={28} className="shrink-0 object-contain" style={{width: 28, height: 28}}
                title={name} onError={() => setFailed(true)}/>;
};

/** オオモノごとの自分の討伐数（横棒。多い順）。チームの討伐数 / 出現数は横に文字で添える */
const BossBars: React.FC<{bosses: SalmonSessionReview['bosses']}> = ({bosses}) => {
    const rows = bosses.flatMap((count) => {
        const boss = findSalmonBoss(count.boss);
        return boss ? [{boss, count}] : [];
    });
    const max = Math.max(1, ...rows.map((r) => r.count.selfKills));
    return (
        // オオモノは最大 14 種（SALMON_BOSSES）。2 列 7 行が下段に収まる高さにしている
        <ol className="grid grid-cols-2 gap-x-8 gap-y-0.5" data-testid="review-bosses">
            {rows.map(({boss, count}) => (
                <li key={boss.key} className="flex items-center gap-2" style={{height: 29}}>
                    <BossImage name={boss.name} image={bossImageUrl(boss)}/>
                    <span className="shrink-0" style={{width: 110, fontSize: 18, color: INK.primary}}>{boss.name}</span>
                    <span className="flex-1 flex items-center gap-2 min-w-0">
                        {count.selfKills > 0 && (
                            <span className="h-[18px] rounded-r" style={{width: `${(count.selfKills / max) * 85}%`, backgroundColor: BOSS_BAR}}/>
                        )}
                        <span className="font-bold" style={{fontSize: 20, color: INK.primary}}>{count.selfKills}</span>
                    </span>
                    <span className="shrink-0 text-right whitespace-nowrap" style={{width: 150, fontSize: 14, color: INK.muted, fontVariantNumeric: 'tabular-nums'}}>
                        チーム {count.teamKills} / 出現 {count.appearances}
                    </span>
                </li>
            ))}
        </ol>
    );
};

const formatNumber = (n: number) => n.toLocaleString('ja-JP');

const formatDate = (timestamp: number) => {
    const d = new Date(timestamp);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
};

/** 配信の最後に出す、その日のサーモンランの振り返り（1920×1080） */
const SalmonReview: React.FC<SalmonReviewProps> = ({review}) => {
    const {totals, jobs} = review;
    const clearRate = totals.jobs > 0 ? Math.round((totals.clears / totals.jobs) * 100) : 0;
    const best = jobs.find((j) => j.id === review.bestJobId) ?? null;
    const weapons = review.weapons.flatMap((w) => {
        const weapon = findSalmonWeapon(w.key);
        return weapon ? [{weapon, count: w.count}] : [];
    });
    const newWeapons = review.newWeapons.flatMap((key) => {
        const weapon = findSalmonWeapon(key);
        return weapon ? [weapon] : [];
    });
    const detailNote = review.detailedJobs < totals.jobs ? `取り込んだ ${review.detailedJobs} 件の合計` : undefined;

    return (
        <div className="flex flex-col gap-5 p-12" style={{width: REVIEW_WIDTH, height: REVIEW_HEIGHT, backgroundColor: 'rgba(8, 8, 8, 0.78)', color: INK.primary}}
             data-testid="salmon-review">
            <motion.header className="flex items-end justify-between" initial={{opacity: 0}} animate={{opacity: 1}} transition={{duration: 0.5}}>
                <div>
                    <p style={{fontSize: 22, color: INK.muted}}>
                        {review.session ? [formatDate(review.session.startedAt), review.session.title].filter(Boolean).join('　') : ''}
                    </p>
                    <h1 className="font-bold" style={{fontSize: 56, color: '#FF6F00'}}>本日のサーモンラン</h1>
                </div>
                <div className="flex items-baseline gap-3">
                    <span style={{fontSize: 24, color: INK.muted}}>クリア率</span>
                    <span className="font-bold" style={{fontSize: 72}} data-testid="review-clear-rate">{clearRate}%</span>
                    <span style={{fontSize: 24, color: INK.muted}}>{totals.clears} / {totals.jobs} バイト</span>
                </div>
            </motion.header>

            <Card title="合計" order={1}>
                <div className="grid grid-cols-7 gap-4">
                    <StatTile label="金イクラ" value={formatNumber(totals.goldenEggs)}/>
                    <StatTile label="オオモノ" value={formatNumber(totals.bossKills)}/>
                    <StatTile label="デス" value={formatNumber(totals.deaths)}/>
                    <StatTile label="赤イクラ" value={review.detailedJobs > 0 ? formatNumber(review.powerEggs) : '-'} note={detailNote}/>
                    <StatTile label="救助" value={review.detailedJobs > 0 ? formatNumber(review.rescues) : '-'} note={detailNote}/>
                    <StatTile label="獲得ポイント" value={review.detailedJobs > 0 ? `${formatNumber(review.jobPoints)}p` : '-'}/>
                    <StatTile label="最高キケン度" value={review.maxHazardLevel !== null ? `${review.maxHazardLevel}%` : '-'}/>
                </div>
            </Card>

            <div className="flex gap-5 min-h-0">
                <Card title="バイトごとの金イクラ" order={2} className="flex-1" testId="review-golden-eggs">
                    <div className="flex gap-4 mb-1">
                        <LegendKey color={CLEARED} label="クリア"/>
                        <LegendKey color={FAILED} label="失敗"/>
                    </div>
                    {jobs.length > 0 ? <GoldenEggsChart jobs={jobs} bestJobId={review.bestJobId}/> : <p style={{color: INK.muted}}>まだバイトの記録がありません</p>}
                </Card>
                <Card title="結果" order={3} className="w-[620px]">
                    <OutcomeBar clears={totals.clears} waveFailures={review.waveFailures}/>
                    {review.kings.appeared > 0 && (
                        <p className="mt-4" style={{fontSize: 20, color: INK.primary}} data-testid="review-kings">
                            オカシラ {review.kings.defeated} / {review.kings.appeared} 撃破
                        </p>
                    )}
                    {review.firstGrade && review.lastGrade && (
                        <p className="mt-2" style={{fontSize: 20, color: INK.primary}} data-testid="review-grade">
                            評価 {review.firstGrade.name} {review.firstGrade.point} → {review.lastGrade.name} {review.lastGrade.point}
                        </p>
                    )}
                    {best && (
                        <p className="mt-2" style={{fontSize: 20, color: INK.primary}} data-testid="review-best-job">
                            ベスト 金イクラ {best.goldenEggs}（{jobs.indexOf(best) + 1} バイト目{best.stage ? `・${best.stage}` : ''}）
                        </p>
                    )}
                </Card>
            </div>

            <div className="flex gap-5 flex-1 min-h-0">
                <Card title="オオモノ討伐（自分）" order={4} className="flex-1 overflow-hidden">
                    {review.bosses.length > 0
                        ? <BossBars bosses={review.bosses}/>
                        : <p style={{color: INK.muted, fontSize: 18}}>イカリング3から取り込んだバイトがありません</p>}
                </Card>
                <Card title="チーム納品ハイスコア" order={5} className="w-[300px]" testId="review-team-high-scores">
                    {review.teamHighScores.length > 0 ? (
                        <ol className="flex flex-col gap-1">
                            {review.teamHighScores.map((score, i) => (
                                <li key={score.jobId} className="flex items-baseline gap-3">
                                    <span className="w-5 text-right font-bold" style={{fontSize: 18, color: INK.muted}}>{i + 1}</span>
                                    <span className="w-16 text-right font-bold" style={{fontSize: 30, color: INK.primary, fontVariantNumeric: 'tabular-nums'}}>
                                        {score.teamGoldenEggs}
                                    </span>
                                    <span style={{fontSize: 15, color: INK.secondary}}>
                                        {score.jobNumber} バイト目{score.hazardLevel !== null ? `・${score.hazardLevel}%` : ''}
                                    </span>
                                </li>
                            ))}
                        </ol>
                    ) : <p style={{color: INK.muted, fontSize: 18}}>イカリング3から取り込んだバイトがありません</p>}
                </Card>
                <Card title="ブキ" order={6} className="w-[400px] overflow-hidden">
                    {weapons.length > 0 && (
                        <ul className="flex gap-3" data-testid="review-weapons">
                            {weapons.map(({weapon, count}) => (
                                <li key={weapon.key} className="flex flex-col items-center">
                                    <WeaponIcon weapon={weapon} size={56}/>
                                    <span style={{fontSize: 16, color: INK.secondary}}>{count} 回</span>
                                </li>
                            ))}
                        </ul>
                    )}
                    {newWeapons.length > 0 && (
                        <div className="mt-4" data-testid="review-new-weapons">
                            <p style={{fontSize: 18, color: INK.secondary}}>ブキ埋めカード +{newWeapons.length}</p>
                            <div className="flex flex-wrap gap-1 mt-1">
                                {newWeapons.slice(0, NEW_WEAPON_ICON_LIMIT).map((weapon) => <WeaponIcon key={weapon.key} weapon={weapon} size={40}/>)}
                            </div>
                        </div>
                    )}
                    <div className="mt-auto flex gap-8 pt-4" style={{fontSize: 20}}>
                        {review.challenges && (
                            <span data-testid="review-challenges">お題 {review.challenges.done} / {review.challenges.total} 達成</span>
                        )}
                        {review.clips > 0 && <span data-testid="review-clips">クリップ {review.clips} 本</span>}
                    </div>
                </Card>
            </div>
        </div>
    );
};

export default SalmonReview;
