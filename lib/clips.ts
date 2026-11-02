import {CLIP_EXPIRED_ERROR, CLIP_REQUEST_TTL_MS, ClipRequest, ClipResult, ClipSource, ClipStatus} from './clipTypes';
import {getDb} from './db';

interface ClipRow {
    id: number;
    source: ClipSource;
    status: ClipStatus;
    requested_at: number;
    completed_at: number | null;
    clip_id: string | null;
    edit_url: string | null;
    error: string | null;
}

const toClip = (row: ClipRow): ClipRequest => ({
    id: row.id,
    source: row.source,
    status: row.status,
    requestedAt: row.requested_at,
    completedAt: row.completed_at,
    clipId: row.clip_id,
    editUrl: row.edit_url,
    error: row.error,
});

const findClip = (id: number): ClipRequest | null => {
    const row = getDb().prepare('SELECT * FROM twitch_clips WHERE id = ?').get(id) as ClipRow | undefined;
    return row ? toClip(row) : null;
};

/** Twitch 連携スクリプトが TTL 内に処理しなかった依頼を失敗にする（後から別の瞬間のクリップを作らないように） */
export function expireStaleRequests(now = Date.now()): void {
    getDb().prepare("UPDATE twitch_clips SET status = 'failed', completed_at = ?, error = ? WHERE status = 'pending' AND requested_at < ?")
        .run(now, CLIP_EXPIRED_ERROR, now - CLIP_REQUEST_TTL_MS);
}

/** クリップを依頼する。処理待ちの依頼があればそれを返す（連呼・連打で同じ場面のクリップを重ねて作らない） */
export function requestClip(source: ClipSource, now = Date.now()): ClipRequest {
    expireStaleRequests(now);
    const pending = listPendingClips(now)[0];
    if (pending) return pending;
    const {lastInsertRowid} = getDb().prepare("INSERT INTO twitch_clips (source, status, requested_at) VALUES (?, 'pending', ?)").run(source, now);
    return findClip(Number(lastInsertRowid))!;
}

/** 処理待ちの依頼（古い順） */
export function listPendingClips(now = Date.now()): ClipRequest[] {
    expireStaleRequests(now);
    return (getDb().prepare("SELECT * FROM twitch_clips WHERE status = 'pending' ORDER BY id").all() as unknown as ClipRow[]).map(toClip);
}

/** 依頼の一覧（新しい順） */
export function listClips(limit = 50, now = Date.now()): ClipRequest[] {
    expireStaleRequests(now);
    return (getDb().prepare('SELECT * FROM twitch_clips ORDER BY id DESC LIMIT ?').all(limit) as unknown as ClipRow[]).map(toClip);
}

// 作成中に期限切れにされた依頼も、作れたクリップは履歴に残すため結果を書き込めるようにする
const COMPLETABLE = "(status = 'pending' OR (status = 'failed' AND error = ?))";

/** 処理待ちの依頼に結果を書き込む。無い・処理済みなら null */
export function completeClip(id: number, result: ClipResult, now = Date.now()): ClipRequest | null {
    const {changes} = result.status === 'created'
        ? getDb().prepare(`UPDATE twitch_clips SET status = 'created', completed_at = ?, clip_id = ?, edit_url = ?, error = NULL WHERE id = ? AND ${COMPLETABLE}`)
            .run(now, result.clipId, result.editUrl, id, CLIP_EXPIRED_ERROR)
        : getDb().prepare(`UPDATE twitch_clips SET status = 'failed', completed_at = ?, error = ? WHERE id = ? AND ${COMPLETABLE}`)
            .run(now, result.error, id, CLIP_EXPIRED_ERROR);
    return Number(changes) === 0 ? null : findClip(id);
}

/**
 * 履歴から消す（Twitch 上のクリップは消さない）。作成待ちのものは消さない
 * （作成中に消すと、作れたクリップの結果を書き込めずに失われるため）
 */
export function deleteClip(id: number, now = Date.now()): 'deleted' | 'pending' | 'notFound' {
    expireStaleRequests(now);
    const clip = findClip(id);
    if (!clip) return 'notFound';
    if (clip.status === 'pending') return 'pending';
    getDb().prepare('DELETE FROM twitch_clips WHERE id = ?').run(id);
    return 'deleted';
}
