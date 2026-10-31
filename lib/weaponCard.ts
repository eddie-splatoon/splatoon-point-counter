import {getAppState, getDb, setAppState} from './db';
import {parseStoredWeapons} from './salmon';
import {ObtainedWeapon, SALMON_WEAPON_COUNT, WeaponCard, isSalmonWeaponKey} from './salmonWeapons';

// ブキ埋めカードの状態（サーバー専用）。埋まっているブキは「カード開始以降に記録したバイトのブキ」と「手動で埋めたブキ」を合わせたもの
const STATE_KEY = 'weaponCard';

interface WeaponCardState {
    startedAt: number;
    manual: {key: string; at: number}[];
}

const isTimestamp = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;

/** 保存済みの状態。未保存・不正なら、すべての記録を対象にした手動分なしのカード */
function readState(): WeaponCardState {
    const saved = (getAppState(STATE_KEY) ?? {}) as Record<string, unknown>;
    const startedAt = isTimestamp(saved.startedAt) ? saved.startedAt : 0;
    const manual = Array.isArray(saved.manual)
        ? saved.manual.filter((m): m is {key: string; at: number} => isSalmonWeaponKey(m?.key) && isTimestamp(m?.at))
        : [];
    return {startedAt, manual};
}

export function getWeaponCard(): WeaponCard {
    const {startedAt, manual} = readState();
    const rows = getDb().prepare('SELECT created_at, weapons FROM salmon_jobs WHERE created_at >= ? ORDER BY created_at, id')
        .all(startedAt) as {created_at: number; weapons: string}[];

    const obtained = new Map<string, ObtainedWeapon>();
    for (const row of rows) {
        for (const key of parseStoredWeapons(row.weapons)) {
            if (!obtained.has(key)) obtained.set(key, {key, at: row.created_at, source: 'job'});
        }
    }
    // 手動で埋めたあとに記録でも埋まったものは、記録由来（手動では外せない）として最初に埋めた時刻を残す
    for (const {key, at} of manual) {
        const fromJob = obtained.get(key);
        obtained.set(key, fromJob ? {...fromJob, at: Math.min(fromJob.at, at)} : {key, at, source: 'manual'});
    }
    return {startedAt, total: SALMON_WEAPON_COUNT, obtained: [...obtained.values()].sort((a, b) => a.at - b.at)};
}

/** 手動で埋める / 手動で埋めたものを外す（記録から埋まったものは、記録を取り消さないと外れない） */
export function setManualWeapon(key: string, obtained: boolean, now = Date.now()): WeaponCard {
    const state = readState();
    const manual = state.manual.filter((m) => m.key !== key);
    if (obtained) manual.push(state.manual.find((m) => m.key === key) ?? {key, at: now});
    setAppState(STATE_KEY, {...state, manual});
    return getWeaponCard();
}

/** 新しいカードを始める（これより前の記録と手動分は数えない） */
export function startWeaponCard(now = Date.now()): WeaponCard {
    setAppState(STATE_KEY, {startedAt: now, manual: []});
    return getWeaponCard();
}

/** PATCH の本文を検証する。不正ならエラーメッセージを返す */
export function parseManualWeapon(body: unknown): {weapon: string; obtained: boolean} | string {
    const {weapon, obtained} = (body ?? {}) as Record<string, unknown>;
    if (!isSalmonWeaponKey(weapon)) return 'weapon must be a known weapon key.';
    if (typeof obtained !== 'boolean') return 'obtained must be a boolean.';
    return {weapon, obtained};
}
