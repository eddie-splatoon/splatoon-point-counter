// コントロールパネルで決めるオーバーレイの設定の保存。サーバー専用（node:sqlite に依存する）。
// 以前はサーバーのメモリだけに持っていて再起動で消えたので、ほかの設定と同じく SQLite の app_state に保存する

import {getAppState, setAppState} from './db';
import {StreamSettings, parseStoredStreamSettings} from './streamSettingsTypes';

export const STREAM_SETTINGS_STATE_KEY = 'streamSettings';

export function getStreamSettings(): StreamSettings {
    return parseStoredStreamSettings(getAppState(STREAM_SETTINGS_STATE_KEY));
}

/** SQLite に設定が保存済みか（コントロールパネルが、以前の localStorage の設定を 1 回だけ移すときに使う） */
export function hasStoredStreamSettings(): boolean {
    return getAppState(STREAM_SETTINGS_STATE_KEY) !== null;
}

/** 送られた項目だけを書き換えて保存する（検証は parseStreamSettingsUpdate で済ませておく） */
export function updateStreamSettings(update: Partial<StreamSettings>): StreamSettings {
    const next = {...getStreamSettings(), ...update};
    setAppState(STREAM_SETTINGS_STATE_KEY, next);
    return next;
}
