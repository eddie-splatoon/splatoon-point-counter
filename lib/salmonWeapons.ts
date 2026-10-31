// サーモンランで支給されるブキ（ブキ埋めカード・戦績記録で使う）。クライアントからも使うため DB に依存させない

export const SALMON_WEAPON_CATEGORIES = [
    'シューター', 'ブラスター', 'ローラー', 'フデ', 'チャージャー', 'スロッシャー',
    'スピナー', 'マニューバー', 'シェルター', 'ストリンガー', 'ワイパー', 'クマサン印',
] as const;

export type SalmonWeaponCategory = typeof SALMON_WEAPON_CATEGORIES[number];

export interface SalmonWeapon {
    key: string; // stat.ink の key
    name: string;
    category: SalmonWeaponCategory;
    image: string; // ゲーム内部のブキ名（画像のファイル名に使う）
}

/**
 * 支給されうるブキ（ゲーム内のカテゴリ順）。サーモンランで支給されないスプラスコープ・4Kスコープは含めない。
 * ブキが追加されたら、ここに足す（key は stat.ink の /api/v3/salmon/weapon、image は Leanny/splat3 の画像のファイル名）
 */
export const SALMON_WEAPONS: readonly SalmonWeapon[] = [
    {key: 'bold', name: 'ボールドマーカー', category: 'シューター', image: 'Shooter_Short_00'},
    {key: 'wakaba', name: 'わかばシューター', category: 'シューター', image: 'Shooter_First_00'},
    {key: 'sharp', name: 'シャープマーカー', category: 'シューター', image: 'Shooter_Precision_00'},
    {key: 'promodeler_mg', name: 'プロモデラーMG', category: 'シューター', image: 'Shooter_Blaze_00'},
    {key: 'sshooter', name: 'スプラシューター', category: 'シューター', image: 'Shooter_Normal_00'},
    {key: '52gal', name: '.52ガロン', category: 'シューター', image: 'Shooter_Gravity_00'},
    {key: 'nzap85', name: 'N-ZAP85', category: 'シューター', image: 'Shooter_QuickMiddle_00'},
    {key: 'spaceshooter', name: 'スペースシューター', category: 'シューター', image: 'Shooter_QuickLong_00'},
    {key: 'prime', name: 'プライムシューター', category: 'シューター', image: 'Shooter_Expert_00'},
    {key: '96gal', name: '.96ガロン', category: 'シューター', image: 'Shooter_Heavy_00'},
    {key: 'jetsweeper', name: 'ジェットスイーパー', category: 'シューター', image: 'Shooter_Long_00'},
    {key: 'l3reelgun', name: 'L3リールガン', category: 'シューター', image: 'Shooter_TripleQuick_00'},
    {key: 'h3reelgun', name: 'H3リールガン', category: 'シューター', image: 'Shooter_TripleMiddle_00'},
    {key: 'bottlegeyser', name: 'ボトルガイザー', category: 'シューター', image: 'Shooter_Flash_00'},
    {key: 'nova', name: 'ノヴァブラスター', category: 'ブラスター', image: 'Blaster_Short_00'},
    {key: 'hotblaster', name: 'ホットブラスター', category: 'ブラスター', image: 'Blaster_Middle_00'},
    {key: 'longblaster', name: 'ロングブラスター', category: 'ブラスター', image: 'Blaster_Long_00'},
    {key: 'clashblaster', name: 'クラッシュブラスター', category: 'ブラスター', image: 'Blaster_LightShort_00'},
    {key: 'rapid', name: 'ラピッドブラスター', category: 'ブラスター', image: 'Blaster_Light_00'},
    {key: 'rapid_elite', name: 'Rブラスターエリート', category: 'ブラスター', image: 'Blaster_LightLong_00'},
    {key: 'sblast92', name: 'S-BLAST92', category: 'ブラスター', image: 'Blaster_Precision_00'},
    {key: 'carbon', name: 'カーボンローラー', category: 'ローラー', image: 'Roller_Compact_00'},
    {key: 'splatroller', name: 'スプラローラー', category: 'ローラー', image: 'Roller_Normal_00'},
    {key: 'dynamo', name: 'ダイナモローラー', category: 'ローラー', image: 'Roller_Heavy_00'},
    {key: 'variableroller', name: 'ヴァリアブルローラー', category: 'ローラー', image: 'Roller_Hunter_00'},
    {key: 'wideroller', name: 'ワイドローラー', category: 'ローラー', image: 'Roller_Wide_00'},
    {key: 'pablo', name: 'パブロ', category: 'フデ', image: 'Brush_Mini_00'},
    {key: 'hokusai', name: 'ホクサイ', category: 'フデ', image: 'Brush_Normal_00'},
    {key: 'fincent', name: 'フィンセント', category: 'フデ', image: 'Brush_Heavy_00'},
    {key: 'squiclean_a', name: 'スクイックリンα', category: 'チャージャー', image: 'Charger_Quick_00'},
    {key: 'splatcharger', name: 'スプラチャージャー', category: 'チャージャー', image: 'Charger_Normal_00'},
    {key: 'liter4k', name: 'リッター4K', category: 'チャージャー', image: 'Charger_Long_00'},
    {key: 'bamboo14mk1', name: '14式竹筒銃・甲', category: 'チャージャー', image: 'Charger_Light_00'},
    {key: 'soytuber', name: 'ソイチューバー', category: 'チャージャー', image: 'Charger_Keeper_00'},
    {key: 'rpen_5h', name: 'R-PEN/5H', category: 'チャージャー', image: 'Charger_Pencil_00'},
    {key: 'bucketslosher', name: 'バケットスロッシャー', category: 'スロッシャー', image: 'Slosher_Strong_00'},
    {key: 'hissen', name: 'ヒッセン', category: 'スロッシャー', image: 'Slosher_Diffusion_00'},
    {key: 'screwslosher', name: 'スクリュースロッシャー', category: 'スロッシャー', image: 'Slosher_Launcher_00'},
    {key: 'furo', name: 'オーバーフロッシャー', category: 'スロッシャー', image: 'Slosher_Bathtub_00'},
    {key: 'explosher', name: 'エクスプロッシャー', category: 'スロッシャー', image: 'Slosher_Washtub_00'},
    {key: 'moprin', name: 'モップリン', category: 'スロッシャー', image: 'Slosher_Double_00'},
    {key: 'splatspinner', name: 'スプラスピナー', category: 'スピナー', image: 'Spinner_Quick_00'},
    {key: 'barrelspinner', name: 'バレルスピナー', category: 'スピナー', image: 'Spinner_Standard_00'},
    {key: 'hydra', name: 'ハイドラント', category: 'スピナー', image: 'Spinner_Hyper_00'},
    {key: 'kugelschreiber', name: 'クーゲルシュライバー', category: 'スピナー', image: 'Spinner_Downpour_00'},
    {key: 'nautilus47', name: 'ノーチラス47', category: 'スピナー', image: 'Spinner_Serein_00'},
    {key: 'examiner', name: 'イグザミナー', category: 'スピナー', image: 'Spinner_HyperShort_00'},
    {key: 'sputtery', name: 'スパッタリー', category: 'マニューバー', image: 'Maneuver_Short_00'},
    {key: 'maneuver', name: 'スプラマニューバー', category: 'マニューバー', image: 'Maneuver_Normal_00'},
    {key: 'kelvin525', name: 'ケルビン525', category: 'マニューバー', image: 'Maneuver_Gallon_00'},
    {key: 'dualsweeper', name: 'デュアルスイーパー', category: 'マニューバー', image: 'Maneuver_Dual_00'},
    {key: 'quadhopper_black', name: 'クアッドホッパーブラック', category: 'マニューバー', image: 'Maneuver_Stepper_00'},
    {key: 'gaen_ff', name: 'ガエンFF', category: 'マニューバー', image: 'Maneuver_Long_00'},
    {key: 'parashelter', name: 'パラシェルター', category: 'シェルター', image: 'Shelter_Normal_00'},
    {key: 'campingshelter', name: 'キャンピングシェルター', category: 'シェルター', image: 'Shelter_Wide_00'},
    {key: 'spygadget', name: 'スパイガジェット', category: 'シェルター', image: 'Shelter_Compact_00'},
    {key: 'brella24mk1', name: '24式張替傘・甲', category: 'シェルター', image: 'Shelter_Focus_00'},
    {key: 'tristringer', name: 'トライストリンガー', category: 'ストリンガー', image: 'Stringer_Normal_00'},
    {key: 'lact450', name: 'LACT-450', category: 'ストリンガー', image: 'Stringer_Short_00'},
    {key: 'furuido', name: 'フルイドV', category: 'ストリンガー', image: 'Stringer_Explosion_00'},
    {key: 'jimuwiper', name: 'ジムワイパー', category: 'ワイパー', image: 'Saber_Normal_00'},
    {key: 'drivewiper', name: 'ドライブワイパー', category: 'ワイパー', image: 'Saber_Lite_00'},
    {key: 'dentalwiper_mint', name: 'デンタルワイパーミント', category: 'ワイパー', image: 'Saber_Heavy_00'},
    {key: 'kuma_blaster', name: 'クマサン印のブラスター', category: 'クマサン印', image: 'Blaster_Bear'},
    {key: 'kuma_shelter', name: 'クマサン印のシェルター', category: 'クマサン印', image: 'Shelter_Bear'},
    {key: 'kuma_charger', name: 'クマサン印のチャージャー', category: 'クマサン印', image: 'Charger_Bear'},
    {key: 'kuma_slosher', name: 'クマサン印のスロッシャー', category: 'クマサン印', image: 'Slosher_Bear'},
    {key: 'kuma_wiper', name: 'クマサン印のワイパー', category: 'クマサン印', image: 'Saber_Bear'},
    {key: 'kuma_stringer', name: 'クマサン印のストリンガー', category: 'クマサン印', image: 'Stringer_Bear'},
    {key: 'kuma_roller', name: 'クマサン印のローラー', category: 'クマサン印', image: 'Roller_Bear'},
    {key: 'kuma_maneuver', name: 'クマサン印のマニューバー', category: 'クマサン印', image: 'Maneuver_Bear'},
];

export const SALMON_WEAPON_COUNT = SALMON_WEAPONS.length;

// 1回のバイトで支給されるブキの最大数（3 WAVE + EX WAVE）
export const MAX_JOB_WEAPONS = 4;

const WEAPONS_BY_KEY = new Map(SALMON_WEAPONS.map((weapon) => [weapon.key, weapon]));

export const findSalmonWeapon = (key: string): SalmonWeapon | undefined => WEAPONS_BY_KEY.get(key);

export const isSalmonWeaponKey = (value: unknown): value is string => typeof value === 'string' && WEAPONS_BY_KEY.has(value);

/**
 * ブキの画像。Nintendo の画像をこのリポジトリに同梱しないよう、ゲームのデータをまとめている Leanny/splat3 を参照する。
 * リンク切れに備えて、表示側は読み込めなければブキ名を出す
 */
export const weaponImageUrl = (weapon: SalmonWeapon): string =>
    `https://raw.githubusercontent.com/Leanny/splat3/main/images/weapon_flat/Path_Wst_${weapon.image}.png`;

// ---- ブキ埋めカード ----

export interface ObtainedWeapon {
    key: string;
    at: number; // 最初に埋まった時刻
    source: 'job' | 'manual'; // job: 戦績の記録から（記録を取り消すと外れる）、manual: 手動で埋めた
}

export interface WeaponCard {
    startedAt: number; // カードを始めた時刻。これ以降の記録のブキで埋まる
    total: number;
    obtained: ObtainedWeapon[]; // 埋まった順
}
