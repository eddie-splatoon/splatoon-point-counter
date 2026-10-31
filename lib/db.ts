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
    weapons TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS salmon_jobs_session_id ON salmon_jobs(session_id);
-- 画面ごとの設定など、1つの値を JSON で丸ごと保存するキーバリュー
CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
`;

/** CREATE TABLE IF NOT EXISTS では既存のテーブルに列が増えないので、後から追加した列を足す */
function migrate(db: DatabaseSync): void {
    const columns = (db.prepare('PRAGMA table_info(salmon_jobs)').all() as {name: string}[]).map((c) => c.name);
    if (!columns.includes('weapons')) db.exec("ALTER TABLE salmon_jobs ADD COLUMN weapons TEXT NOT NULL DEFAULT '[]'");
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
