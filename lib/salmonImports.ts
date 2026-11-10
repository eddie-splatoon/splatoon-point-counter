import {getDb} from './db';
import {addJob, parseJob} from './salmon';
import {
    CAPTURE_FILE_PATTERN,
    MAX_CAPTURES,
    MAX_PLAYED_AT_LENGTH,
    MAX_SALMON_IMPORT_ERROR_LENGTH,
    SALMON_IMPORT_EXPIRED_ERROR,
    SALMON_IMPORT_PROCESSING_TTL_MS,
    SALMON_IMPORT_REQUEST_TTL_MS,
    SALMON_IMPORT_TIMED_OUT_ERROR,
    SalmonImportRequest,
    SalmonImportStatus,
} from './salmonImportTypes';
import {NewSalmonJob} from './salmonTypes';

interface ImportRow {
    id: number;
    status: SalmonImportStatus;
    requested_at: number;
    started_at: number | null;
    completed_at: number | null;
    job_id: number | null;
    played_at: string | null;
    captures: string;
    error: string | null;
}

const parseStoredCaptures = (value: string): string[] => {
    try {
        const parsed: unknown = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === 'string' && CAPTURE_FILE_PATTERN.test(c)) : [];
    } catch {
        return [];
    }
};

const toImport = (row: ImportRow): SalmonImportRequest => ({
    id: row.id,
    status: row.status,
    requestedAt: row.requested_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    jobId: row.job_id,
    playedAt: row.played_at,
    captures: parseStoredCaptures(row.captures),
    error: row.error,
});

const findImport = (id: number): SalmonImportRequest | null => {
    const row = getDb().prepare('SELECT * FROM salmon_imports WHERE id = ?').get(id) as ImportRow | undefined;
    return row ? toImport(row) : null;
};

/**
 * スクリプトが拾わなかった依頼と、取り込み中のまま止まった依頼を失敗にする
 * （後から起動したスクリプトが別のバイトを取り込まない・止まった依頼で新しい依頼を出せなくならないように）
 */
export function expireStaleImports(now = Date.now()): void {
    const db = getDb();
    db.prepare("UPDATE salmon_imports SET status = 'failed', completed_at = ?, error = ? WHERE status = 'pending' AND requested_at < ?")
        .run(now, SALMON_IMPORT_EXPIRED_ERROR, now - SALMON_IMPORT_REQUEST_TTL_MS);
    db.prepare("UPDATE salmon_imports SET status = 'failed', completed_at = ?, error = ? WHERE status = 'processing' AND started_at < ?")
        .run(now, SALMON_IMPORT_TIMED_OUT_ERROR, now - SALMON_IMPORT_PROCESSING_TTL_MS);
}

/** 取り込みを依頼する。処理待ち・取り込み中の依頼があればそれを返す（連打で同じバイトを重ねて取り込まない） */
export function requestImport(now = Date.now()): SalmonImportRequest {
    expireStaleImports(now);
    const active = getDb().prepare("SELECT * FROM salmon_imports WHERE status IN ('pending', 'processing') ORDER BY id LIMIT 1").get() as ImportRow | undefined;
    if (active) return toImport(active);
    const {lastInsertRowid} = getDb().prepare("INSERT INTO salmon_imports (status, requested_at) VALUES ('pending', ?)").run(now);
    return findImport(Number(lastInsertRowid))!;
}

/** 処理待ちの依頼（古い順） */
export function listPendingImports(now = Date.now()): SalmonImportRequest[] {
    expireStaleImports(now);
    return (getDb().prepare("SELECT * FROM salmon_imports WHERE status = 'pending' ORDER BY id").all() as unknown as ImportRow[]).map(toImport);
}

/** 依頼の一覧（新しい順） */
export function listImports(limit = 20, now = Date.now()): SalmonImportRequest[] {
    expireStaleImports(now);
    return (getDb().prepare('SELECT * FROM salmon_imports ORDER BY id DESC LIMIT ?').all(limit) as unknown as ImportRow[]).map(toImport);
}

export type SalmonImportResult =
    | {status: 'processing'}
    | {status: 'succeeded'; job: NewSalmonJob; playedAt: string; captures: string[]}
    | {status: 'failed'; error: string; captures: string[]};

/** 記録が残っている（取り消されていない）取り込みに、同じ日時のバイトがあるか */
const isAlreadyImported = (playedAt: string): boolean =>
    getDb().prepare(`
        SELECT 1 FROM salmon_imports i JOIN salmon_jobs j ON j.id = i.job_id
        WHERE i.status = 'succeeded' AND i.played_at = ?`).get(playedAt) !== undefined;

/**
 * 依頼の状態を進める。processing は処理待ちの依頼だけ、結果は取り込み中の依頼だけに書き込める。
 * succeeded ならバイトを現在のセッションに記録する。同じバイトを取り込み済みなら記録せず 'duplicate'
 * （イカリングにまだ新しいバイトが反映されていない。スクリプトは待って読み直す）
 */
export function updateImport(id: number, result: SalmonImportResult, now = Date.now()): SalmonImportRequest | 'notFound' | 'duplicate' {
    expireStaleImports(now);
    const db = getDb();
    if (result.status === 'processing') {
        const {changes} = db.prepare("UPDATE salmon_imports SET status = 'processing', started_at = ? WHERE id = ? AND status = 'pending'").run(now, id);
        return Number(changes) === 0 ? 'notFound' : findImport(id)!;
    }
    if (findImport(id)?.status !== 'processing') return 'notFound';
    if (result.status === 'failed') {
        db.prepare("UPDATE salmon_imports SET status = 'failed', completed_at = ?, error = ?, captures = ? WHERE id = ?")
            .run(now, result.error, JSON.stringify(result.captures), id);
        return findImport(id)!;
    }
    if (isAlreadyImported(result.playedAt)) return 'duplicate';
    db.exec('BEGIN');
    try {
        const job = addJob(result.job, now);
        db.prepare("UPDATE salmon_imports SET status = 'succeeded', completed_at = ?, job_id = ?, played_at = ?, captures = ?, error = NULL WHERE id = ?")
            .run(now, job.id, result.playedAt, JSON.stringify(result.captures), id);
        db.exec('COMMIT');
    } catch (error) {
        db.exec('ROLLBACK');
        throw error;
    }
    return findImport(id)!;
}

const parseCaptures = (value: unknown): string[] | null =>
    Array.isArray(value) && value.length <= MAX_CAPTURES && value.every((c) => typeof c === 'string' && CAPTURE_FILE_PATTERN.test(c))
        ? value as string[]
        : null;

/** PATCH /api/salmon/import の本文を検証する。不正ならエラーメッセージ */
export function parseImportResult(body: unknown): {id: number; result: SalmonImportResult} | string {
    const {id, status, job, playedAt, captures = [], error} = (body ?? {}) as Record<string, unknown>;
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) return 'id must be a positive integer.';
    if (status === 'processing') return {id, result: {status}};
    const parsedCaptures = parseCaptures(captures);
    if (!parsedCaptures) return `captures must be an array of up to ${MAX_CAPTURES} PNG file names.`;
    if (status === 'succeeded') {
        const parsedJob = parseJob(job);
        if (typeof parsedJob === 'string') return parsedJob;
        if (typeof playedAt !== 'string' || playedAt.trim() === '' || playedAt.length > MAX_PLAYED_AT_LENGTH) {
            return `playedAt must be a non-empty string up to ${MAX_PLAYED_AT_LENGTH} characters.`;
        }
        return {id, result: {status, job: parsedJob, playedAt: playedAt.trim(), captures: parsedCaptures}};
    }
    if (status === 'failed') {
        if (typeof error !== 'string' || error.trim() === '') return 'error must be a non-empty string.';
        return {id, result: {status, error: Array.from(error.trim()).slice(0, MAX_SALMON_IMPORT_ERROR_LENGTH).join(''), captures: parsedCaptures}};
    }
    return "status must be 'processing', 'succeeded' or 'failed'.";
}
