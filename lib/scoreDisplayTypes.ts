// スコア表示（/obs-overlay の scoreLabel / scoreValue）の型・定数・検証。クライアント（コントロールパネル）からも使う

export interface ScoreDisplay {
    scoreLabel: string;
    scoreValue: string;
}

export interface ScoreDisplaySettings extends ScoreDisplay {
    autoUpdate: boolean; // リザルトの取り込みのたびに、バイトの種類に応じたスコアを自動で入れるか
}

export const DEFAULT_SCORE_DISPLAY: ScoreDisplaySettings = {scoreLabel: '現在の評価', scoreValue: '400+', autoUpdate: true};

// 自動で入れるときのラベル
export const GRADE_SCORE_LABEL = '現在のバイト評価';
export const HIGH_SCORE_LABEL = 'ハイスコア';

export const MAX_SCORE_LABEL_LENGTH = 100;
export const MAX_SCORE_VALUE_LENGTH = 50;

// 評価の最上位。これだけは評価名を付けずに数字だけで出す
const TOP_GRADE = 'でんせつ';

/** 評価（でんせつ 720 → 「720」、たつじん+3 450 → 「たつじん+3 450」）。読めていなければ null */
export function formatGrade(name: string | null, point: number | null): string | null {
    if (name === null || point === null) return null;
    return name === TOP_GRADE ? String(point) : `${name} ${point}`;
}

/** PATCH /api/score-display の本文を検証する。送られた項目だけを返す。不正ならエラーメッセージ */
export function parseScoreDisplayUpdate(body: unknown): Partial<ScoreDisplaySettings> | string {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return 'Body must be an object.';
    const {scoreLabel, scoreValue, autoUpdate} = body as Record<string, unknown>;
    const update: Partial<ScoreDisplaySettings> = {};
    if (scoreLabel !== undefined) {
        if (typeof scoreLabel !== 'string' || scoreLabel.length > MAX_SCORE_LABEL_LENGTH) {
            return `scoreLabel must be a string up to ${MAX_SCORE_LABEL_LENGTH} characters.`;
        }
        update.scoreLabel = scoreLabel;
    }
    if (scoreValue !== undefined) {
        if (typeof scoreValue !== 'string' || scoreValue.length > MAX_SCORE_VALUE_LENGTH) {
            return `scoreValue must be a string up to ${MAX_SCORE_VALUE_LENGTH} characters.`;
        }
        update.scoreValue = scoreValue;
    }
    if (autoUpdate !== undefined) {
        if (typeof autoUpdate !== 'boolean') return 'autoUpdate must be a boolean.';
        update.autoUpdate = autoUpdate;
    }
    if (Object.keys(update).length === 0) return 'Specify at least one of scoreLabel, scoreValue and autoUpdate.';
    return update;
}

/** 保存値を読む。壊れていたり項目が足りなければ既定値で補う */
export function parseStoredScoreDisplay(value: unknown): ScoreDisplaySettings {
    const record = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
    return {
        scoreLabel: typeof record.scoreLabel === 'string' ? record.scoreLabel : DEFAULT_SCORE_DISPLAY.scoreLabel,
        scoreValue: typeof record.scoreValue === 'string' ? record.scoreValue : DEFAULT_SCORE_DISPLAY.scoreValue,
        autoUpdate: typeof record.autoUpdate === 'boolean' ? record.autoUpdate : DEFAULT_SCORE_DISPLAY.autoUpdate,
    };
}
