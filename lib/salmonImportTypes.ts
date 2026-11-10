// サーモンランのリザルトの取り込み（iPhone ミラーリングのイカリング3から読み取る）の依頼の型と定数。
// コントロールパネルからも使うため、DB（node:sqlite）に依存する lib/salmonImports.ts とは分けている

export type SalmonImportStatus = 'pending' | 'processing' | 'succeeded' | 'failed';

// この時間内に取り込みスクリプトが拾わなかった依頼は期限切れにする（後から起動したスクリプトが別のバイトを取り込まないように）
export const SALMON_IMPORT_REQUEST_TTL_MS = 30_000;
// 取り込み中のまま止まった依頼（スクリプトの強制終了など）を失敗にするまでの時間。
// スクリプトはイカリングへの反映を最大 4 分待つので、それより長くする
export const SALMON_IMPORT_PROCESSING_TTL_MS = 6 * 60_000;
export const SALMON_IMPORT_EXPIRED_ERROR = '期限切れ（取り込みスクリプトが起動していない可能性があります）';
export const SALMON_IMPORT_TIMED_OUT_ERROR = '時間切れ（取り込みスクリプトが止まった可能性があります）';
export const MAX_SALMON_IMPORT_ERROR_LENGTH = 200;
export const MAX_PLAYED_AT_LENGTH = 50;
export const MAX_CAPTURES = 10;
// 1 回の取り込みで記録するバイトの上限（取りこぼしを遡る数。スクリプトの MAX_BACKFILL_JOBS と合わせる）
export const MAX_IMPORT_JOBS = 20;
// スクリプトが「記録済みか」を判定するために返す、記録済みのバイトの日時の数
export const RECORDED_PLAYED_AT_LIMIT = 200;
// キャプチャはスクリプトが data/salmon-results/ に保存したファイル名だけを受け付ける（パスを含めさせない）
export const CAPTURE_FILE_PATTERN = /^[A-Za-z0-9_-]{1,80}\.png$/;

export interface SalmonImportRequest {
    id: number;
    status: SalmonImportStatus;
    requestedAt: number;
    startedAt: number | null;
    completedAt: number | null;
    jobId: number | null; // 記録したうちの最新のバイト
    playedAt: string | null; // 記録したうちの最新のバイトの、イカリング3に表示された日時
    recordedCount: number; // 取りこぼしも含めて記録したバイトの数
    captures: string[];
    error: string | null;
}

/** 取り込みスクリプトが遡るときに使う、記録済みのバイトの日時と今のセッションの開始時刻 */
export interface SalmonRecordedJobs {
    playedAt: string[];
    sessionStartedAt: number | null;
}
