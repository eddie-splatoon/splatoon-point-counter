// サーモンランのオオモノシャケと、バイトの詳細（潮位など）の定義。クライアントからも使うため DB に依存させない

export interface SalmonBoss {
    key: string; // stat.ink の key
    name: string; // イカリング3の表示名
    image: string; // ゲーム内部の名前（Leanny/splat3 の画像のファイル名に使う）
}

/**
 * イカリング3のバイトの詳細の「オオモノシャケ」の欄に出るもの（表示順。順位が同じときもこの順）。
 * オオモノが追加されたら、ここに足す
 */
export const SALMON_BOSSES: readonly SalmonBoss[] = [
    {key: 'bakudan', name: 'バクダン', image: 'SakelienBomber'},
    {key: 'katapad', name: 'カタパッド', image: 'SakelienCupTwins'},
    {key: 'teppan', name: 'テッパン', image: 'SakelienShield'},
    {key: 'hebi', name: 'ヘビ', image: 'SakelienSnake'},
    {key: 'tower', name: 'タワー', image: 'SakelienTower'},
    {key: 'mogura', name: 'モグラ', image: 'Sakediver'},
    {key: 'koumori', name: 'コウモリ', image: 'Sakerocket'},
    {key: 'hashira', name: 'ハシラ', image: 'SakePillar'},
    {key: 'diver', name: 'ダイバー', image: 'SakeDolphin'},
    {key: 'tekkyu', name: 'テッキュウ', image: 'SakeArtillery'},
    {key: 'nabebuta', name: 'ナベブタ', image: 'SakeSaucer'},
    {key: 'kin_shake', name: 'キンシャケ', image: 'SakelienGolden'},
    {key: 'grill', name: 'グリル', image: 'Sakedozer'},
    {key: 'doro_shake', name: 'ドロシャケ', image: 'SakeBigMouth'},
];

const BOSSES_BY_KEY = new Map(SALMON_BOSSES.map((boss) => [boss.key, boss]));

export const findSalmonBoss = (key: string): SalmonBoss | undefined => BOSSES_BY_KEY.get(key);

export const isSalmonBossKey = (value: unknown): value is string => typeof value === 'string' && BOSSES_BY_KEY.has(value);

/** 表示順（順位が同じときの並び） */
export const salmonBossOrder = (key: string): number => SALMON_BOSSES.findIndex((boss) => boss.key === key);

/** オオモノの画像。ブキと同じく Leanny/splat3 を参照する（表示側は読み込めなければ名前を出す） */
export const bossImageUrl = (boss: SalmonBoss): string =>
    `https://raw.githubusercontent.com/Leanny/splat3/main/images/coopEnemy/${boss.image}.png`;

// 潮位（WAVE ごと）
export const WATER_LEVELS = ['干潮', '普通', '満潮'] as const;
export type WaterLevel = typeof WATER_LEVELS[number];
export const isWaterLevel = (value: unknown): value is WaterLevel =>
    typeof value === 'string' && (WATER_LEVELS as readonly string[]).includes(value);

// EX-WAVE は WAVE 4 として保存する
export const EX_WAVE = 4;
