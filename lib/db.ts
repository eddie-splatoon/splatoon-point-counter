import {mkdirSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';

// 再起動後も残したいデータ（サーモンランの記録など）を保持する SQLite。
// Node 24 標準の node:sqlite を使うため追加の依存やネイティブビルドは不要。
const SCHEMA = `
CREATE TABLE IF NOT EXISTS salmon_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at INTEGER NOT NULL,
    title TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS salmon_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES salmon_sessions(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    golden_eggs INTEGER NOT NULL,
    boss_kills INTEGER NOT NULL,
    deaths INTEGER NOT NULL,
    cleared INTEGER NOT NULL,
    wave_reached INTEGER NOT NULL,
    stage TEXT NOT NULL DEFAULT '',
    weapons TEXT NOT NULL DEFAULT '[]',
    -- イカリング3から取り込んだバイトの日時（同じバイトを二重に記録しないため）。手入力の記録は NULL
    played_at TEXT,
    -- 以下はイカリング3から取り込んだバイトの詳細（lib/salmonTypes.ts の SalmonJobDetails）。手入力・読めなかった項目は NULL
    hazard_level INTEGER,
    grade_name TEXT,
    grade_point INTEGER,
    job_point INTEGER,
    job_score INTEGER,
    job_rate_x100 INTEGER,
    clear_bonus INTEGER,
    team_golden_eggs INTEGER,
    team_power_eggs INTEGER,
    scale_bronze INTEGER,
    scale_silver INTEGER,
    scale_gold INTEGER,
    king_name TEXT,
    king_defeated INTEGER
);
CREATE INDEX IF NOT EXISTS salmon_jobs_session_id ON salmon_jobs(session_id);
-- 取り込んだバイトの WAVE ごとの結果（EX-WAVE は wave = 4）
CREATE TABLE IF NOT EXISTS salmon_job_waves (
    job_id INTEGER NOT NULL REFERENCES salmon_jobs(id) ON DELETE CASCADE,
    wave INTEGER NOT NULL,
    delivered INTEGER,
    quota INTEGER,
    water_level TEXT,
    event TEXT,
    golden_appearances INTEGER,
    specials_used INTEGER,
    PRIMARY KEY (job_id, wave)
);
-- 取り込んだバイトのプレイヤーごとの成績（position = 0 が自分）。名前は DB に残すだけで API には出さない
CREATE TABLE IF NOT EXISTS salmon_job_players (
    job_id INTEGER NOT NULL REFERENCES salmon_jobs(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    name TEXT,
    boss_kills INTEGER,
    golden_eggs INTEGER,
    golden_assists INTEGER,
    power_eggs INTEGER,
    rescues INTEGER,
    rescued INTEGER,
    weapons TEXT NOT NULL DEFAULT '[]',
    special TEXT,
    PRIMARY KEY (job_id, position)
);
-- 取り込んだバイトのオオモノごとの出現数・討伐数
CREATE TABLE IF NOT EXISTS salmon_job_bosses (
    job_id INTEGER NOT NULL REFERENCES salmon_jobs(id) ON DELETE CASCADE,
    boss TEXT NOT NULL,
    appearances INTEGER NOT NULL,
    team_kills INTEGER NOT NULL,
    self_kills INTEGER NOT NULL,
    PRIMARY KEY (job_id, boss)
);
-- 声やボタンで依頼した Twitch のクリップ（tools/twitch-eventsub が作成して結果を書き込む）
CREATE TABLE IF NOT EXISTS twitch_clips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    status TEXT NOT NULL,
    requested_at INTEGER NOT NULL,
    completed_at INTEGER,
    clip_id TEXT,
    edit_url TEXT,
    error TEXT
);
-- iPhone ミラーリングのイカリング3からのリザルトの取り込み依頼（tools/salmon-result が読み取って結果を書き込む）
CREATE TABLE IF NOT EXISTS salmon_imports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    status TEXT NOT NULL,
    requested_at INTEGER NOT NULL,
    started_at INTEGER,
    completed_at INTEGER,
    job_id INTEGER, -- 記録したうちの最新のバイト
    played_at TEXT,
    recorded_count INTEGER NOT NULL DEFAULT 0, -- 取りこぼしも含めて記録したバイトの数
    captures TEXT NOT NULL DEFAULT '[]',
    error TEXT
);
-- 画面ごとの設定など、1つの値を JSON で丸ごと保存するキーバリュー
CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
`;

// salmon_jobs に後から追加した、バイトの詳細の列
const JOB_DETAIL_COLUMNS: [string, 'INTEGER' | 'TEXT'][] = [
    ['hazard_level', 'INTEGER'], ['grade_name', 'TEXT'], ['grade_point', 'INTEGER'], ['job_point', 'INTEGER'],
    ['job_score', 'INTEGER'], ['job_rate_x100', 'INTEGER'], ['clear_bonus', 'INTEGER'], ['team_golden_eggs', 'INTEGER'],
    ['team_power_eggs', 'INTEGER'], ['scale_bronze', 'INTEGER'], ['scale_silver', 'INTEGER'], ['scale_gold', 'INTEGER'],
    ['king_name', 'TEXT'], ['king_defeated', 'INTEGER'],
];

/** CREATE TABLE IF NOT EXISTS では既存のテーブルに列が増えないので、後から追加した列を足す */
function migrate(db: DatabaseSync): void {
    const columnsOf = (table: string) => (db.prepare(`PRAGMA table_info(${table})`).all() as {name: string}[]).map((c) => c.name);
    const jobColumns = columnsOf('salmon_jobs');
    if (!jobColumns.includes('weapons')) db.exec("ALTER TABLE salmon_jobs ADD COLUMN weapons TEXT NOT NULL DEFAULT '[]'");
    if (!jobColumns.includes('played_at')) db.exec('ALTER TABLE salmon_jobs ADD COLUMN played_at TEXT');
    for (const [column, type] of JOB_DETAIL_COLUMNS) {
        if (!jobColumns.includes(column)) db.exec(`ALTER TABLE salmon_jobs ADD COLUMN ${column} ${type}`);
    }
    if (!columnsOf('salmon_imports').includes('recorded_count')) {
        db.exec('ALTER TABLE salmon_imports ADD COLUMN recorded_count INTEGER NOT NULL DEFAULT 0');
    }
}

export function openDb(path: string): DatabaseSync {
    if (path !== ':memory:') mkdirSync(dirname(path), {recursive: true});
    const db = new DatabaseSync(path);
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec(SCHEMA);
    migrate(db);
    return db;
}

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
    db ??= openDb(process.env.OVERLAY_DB_PATH ?? resolve(process.cwd(), 'data/overlay.db'));
    return db;
}

/** app_state から JSON の値を読む。未保存なら null */
export function getAppState(key: string): unknown {
    const row = getDb().prepare('SELECT value FROM app_state WHERE key = ?').get(key) as {value: string} | undefined;
    if (!row) return null;
    try {
        return JSON.parse(row.value);
    } catch {
        return null;
    }
}

export function setAppState(key: string, value: unknown): void {
    getDb().prepare('INSERT INTO app_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
        .run(key, JSON.stringify(value));
}

/**
 * **FOR TESTING PURPOSES ONLY**
 * Replaces the shared database (e.g. with a fresh in-memory one).
 */
export function __TEST_ONLY_setDb(database: DatabaseSync) {
    db = database;
}
