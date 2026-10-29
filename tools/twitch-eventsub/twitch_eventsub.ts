/**
 * Twitch のフォロワー数とフォロワー目標を EventSub WebSocket で受信し、/api/twitch へ送信する常駐スクリプト。
 * チャットも受信し、初めてコメントした視聴者への挨拶と配信者自身のコメントを /api/speech（読み上げキュー）へ送る。
 *
 *   pnpm twitch    # リポジトリのルートで起動（README.md 参照）
 *
 * Node 24 の型除去でそのまま実行するため、enum やコンストラクタ引数プロパティなど
 * 型除去できない TypeScript 構文は使わないこと。
 */
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCOPES = ['moderator:read:followers', 'channel:read:goals', 'user:read:chat'];
export const EVENTSUB_URL = 'wss://eventsub.wss.twitch.tv/ws';
const ID_URL = 'https://id.twitch.tv/oauth2';
const HELIX_URL = 'https://api.twitch.tv/helix';

// unfollow はイベントが無いため、定期的に総数を取り直す（Next.js 再起動でインメモリの値が消えた場合の再送も兼ねる）
const RESYNC_INTERVAL_MS = 60_000;
const INITIAL_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 60_000;
// keepalive_timeout_seconds を過ぎてもメッセージが来なければ切断とみなす（ネットワーク遅延分の猶予）
const KEEPALIVE_MARGIN_MS = 5_000;

const DEFAULT_TOKEN_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../../data/twitch-token.json');

type FetchFn = typeof fetch;
type SleepFn = (ms: number) => Promise<void>;

const defaultSleep: SleepFn = (ms) => new Promise((r) => setTimeout(r, ms));

export interface Token {
  accessToken: string;
  refreshToken: string;
}

export interface DeviceCode {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  interval: number;
  expiresIn: number;
}

export interface GoalState {
  current: number;
  target: number;
}

export interface TwitchState {
  followerTotal: number;
  goal: GoalState | null;
  lastFollowAt: number | null;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
}

const toToken = (json: TokenResponse): Token => ({ accessToken: json.access_token, refreshToken: json.refresh_token });

// ---- OAuth (Device Code Flow) ----

export async function requestDeviceCode(clientId: string, fetchFn: FetchFn = fetch): Promise<DeviceCode> {
  const res = await fetchFn(`${ID_URL}/device`, {
    method: 'POST',
    body: new URLSearchParams({ client_id: clientId, scopes: SCOPES.join(' ') }),
  });
  if (!res.ok) throw new Error(`デバイスコードの取得に失敗しました: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return {
    deviceCode: json.device_code,
    userCode: json.user_code,
    verificationUri: json.verification_uri,
    interval: json.interval,
    expiresIn: json.expires_in,
  };
}

export async function pollDeviceToken(
  clientId: string,
  code: DeviceCode,
  fetchFn: FetchFn = fetch,
  sleep: SleepFn = defaultSleep,
): Promise<Token> {
  let interval = code.interval;
  for (let elapsed = 0; elapsed < code.expiresIn; elapsed += interval) {
    await sleep(interval * 1000);
    const res = await fetchFn(`${ID_URL}/token`, {
      method: 'POST',
      body: new URLSearchParams({
        client_id: clientId,
        scopes: SCOPES.join(' '),
        device_code: code.deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });
    if (res.ok) return toToken(await res.json());
    const { message } = await res.json().catch(() => ({ message: undefined }));
    if (message === 'authorization_pending') continue;
    if (message === 'slow_down') {
      interval += 5;
      continue;
    }
    throw new Error(`認可に失敗しました: ${res.status} ${message ?? ''}`);
  }
  throw new Error('認可の有効期限が切れました。もう一度起動してください');
}

export async function refreshAccessToken(clientId: string, refreshToken: string, fetchFn: FetchFn = fetch): Promise<Token> {
  // Public クライアントなので client_secret は送らない
  const res = await fetchFn(`${ID_URL}/token`, {
    method: 'POST',
    body: new URLSearchParams({ client_id: clientId, grant_type: 'refresh_token', refresh_token: refreshToken }),
  });
  if (!res.ok) throw new Error(`トークンの更新に失敗しました: ${res.status} ${await res.text()}`);
  return toToken(await res.json());
}

export async function validateToken(
  accessToken: string,
  fetchFn: FetchFn = fetch,
): Promise<{ userId: string; login: string; scopes: string[] } | null> {
  const res = await fetchFn(`${ID_URL}/validate`, { headers: { Authorization: `OAuth ${accessToken}` } });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`トークンの検証に失敗しました: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return { userId: json.user_id, login: json.login, scopes: json.scopes ?? [] };
}

export async function loadToken(path: string): Promise<Token | null> {
  try {
    const json = JSON.parse(await readFile(path, 'utf8'));
    return typeof json.accessToken === 'string' && typeof json.refreshToken === 'string' ? json : null;
  } catch {
    return null;
  }
}

export async function saveToken(path: string, token: Token): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, JSON.stringify(token, null, 2), { mode: 0o600 });
  // mode は新規作成時にしか効かないため、既存ファイルの権限も絞る
  await chmod(path, 0o600);
}

// ---- Helix API ----

export class HelixError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** 再試行で直る失敗か（通信断・5xx・429）。スコープ不足などそれ以外の 4xx は再試行しても直らない */
export const isRetryable = (error: unknown): boolean =>
  !(error instanceof HelixError) || error.status === 429 || error.status >= 500;

interface TwitchClientOptions {
  clientId: string;
  tokenPath: string;
  fetchFn?: FetchFn;
  sleep?: SleepFn;
  log?: (message: string) => void;
}

export class TwitchClient {
  userId = '';
  private clientId: string;
  private tokenPath: string;
  private fetchFn: FetchFn;
  private sleep: SleepFn;
  private log: (message: string) => void;
  private token: Token | null = null;
  // Public クライアントのリフレッシュトークンは使い捨てなので、同時に401が返っても更新は1回にまとめる
  private refreshing: Promise<void> | null = null;

  constructor(options: TwitchClientOptions) {
    this.clientId = options.clientId;
    this.tokenPath = options.tokenPath;
    this.fetchFn = options.fetchFn ?? fetch;
    this.sleep = options.sleep ?? defaultSleep;
    this.log = options.log ?? console.log;
  }

  async authenticate(): Promise<void> {
    this.token = await loadToken(this.tokenPath);
    if (this.token) {
      let info = await validateToken(this.token.accessToken, this.fetchFn);
      if (!info) {
        try {
          await this.refreshAndSave();
          info = await validateToken(this.token.accessToken, this.fetchFn);
        } catch (error) {
          this.log(`保存済みトークンを更新できませんでした: ${(error as Error).message}`);
        }
      }
      const scopes = info?.scopes ?? [];
      if (info && SCOPES.every((scope) => scopes.includes(scope))) {
        this.userId = info.userId;
        this.log(`${info.login} として認証しました`);
        return;
      }
    }
    await this.runDeviceFlow();
  }

  async helix(path: string, init: RequestInit = {}): Promise<Response> {
    let res = await this.fetchFn(`${HELIX_URL}${path}`, this.withAuth(init));
    if (res.status === 401) {
      await this.refresh();
      res = await this.fetchFn(`${HELIX_URL}${path}`, this.withAuth(init));
    }
    if (!res.ok) throw new HelixError(res.status, `Helix ${init.method ?? 'GET'} ${path} が失敗しました: ${res.status} ${await res.text()}`);
    return res;
  }

  async getFollowerTotal(): Promise<number> {
    const res = await this.helix(`/channels/followers?broadcaster_id=${this.userId}&first=1`);
    return (await res.json()).total;
  }

  async getFollowerGoal(): Promise<GoalState | null> {
    const res = await this.helix(`/goals?broadcaster_id=${this.userId}`);
    const goal = ((await res.json()).data as GoalEvent[]).find((g) => g.type === 'follower');
    return goal ? { current: goal.current_amount, target: goal.target_amount } : null;
  }

  async subscribeAll(sessionId: string): Promise<void> {
    const subscriptions = [
      { type: 'channel.follow', version: '2', condition: { broadcaster_user_id: this.userId, moderator_user_id: this.userId } },
      { type: 'channel.goal.begin', version: '1', condition: { broadcaster_user_id: this.userId } },
      { type: 'channel.goal.progress', version: '1', condition: { broadcaster_user_id: this.userId } },
      { type: 'channel.goal.end', version: '1', condition: { broadcaster_user_id: this.userId } },
      // 自分のチャンネルのチャットを、自分のアカウントとして読む
      { type: 'channel.chat.message', version: '1', condition: { broadcaster_user_id: this.userId, user_id: this.userId } },
    ];
    for (const sub of subscriptions) {
      await this.helix('/eventsub/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...sub, transport: { method: 'websocket', session_id: sessionId } }),
      });
    }
    this.log(`EventSub を購読しました (${subscriptions.map((s) => s.type).join(', ')})`);
  }

  private withAuth(init: RequestInit): RequestInit {
    return {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${this.token?.accessToken}`, 'Client-Id': this.clientId },
    };
  }

  private refresh(): Promise<void> {
    this.refreshing ??= this.refreshAndSave()
      .catch((error) => {
        this.log(`トークンを更新できませんでした: ${(error as Error).message}`);
        return this.runDeviceFlow();
      })
      .finally(() => {
        this.refreshing = null;
      });
    return this.refreshing;
  }

  private async refreshAndSave(): Promise<void> {
    if (!this.token) throw new Error('トークンがありません');
    this.token = await refreshAccessToken(this.clientId, this.token.refreshToken, this.fetchFn);
    await saveToken(this.tokenPath, this.token);
  }

  private async runDeviceFlow(): Promise<void> {
    const code = await requestDeviceCode(this.clientId, this.fetchFn);
    this.log(`ブラウザで ${code.verificationUri} を開き、コード ${code.userCode} を確認して承認してください`);
    this.token = await pollDeviceToken(this.clientId, code, this.fetchFn, this.sleep);
    await saveToken(this.tokenPath, this.token);
    const info = await validateToken(this.token.accessToken, this.fetchFn);
    if (!info) throw new Error('取得したトークンが無効です');
    this.userId = info.userId;
    this.log(`${info.login} として認証しました`);
  }
}

// ---- EventSub ----

interface GoalEvent {
  type: string;
  current_amount: number;
  target_amount: number;
}

/** EventSub の通知を状態に反映する。フォロワー名は保持しない */
export function applyNotification(state: TwitchState, type: string, event: unknown, now: number): TwitchState {
  if (type === 'channel.follow') {
    // 通知に総数は含まれない。直後の Helix は反映が遅れることがあるため加算し、定期同期で補正する
    return { ...state, followerTotal: state.followerTotal + 1, lastFollowAt: now };
  }
  const goal = event as GoalEvent;
  if (goal.type !== 'follower') return state;
  if (type === 'channel.goal.begin' || type === 'channel.goal.progress') {
    return { ...state, goal: { current: goal.current_amount, target: goal.target_amount } };
  }
  if (type === 'channel.goal.end') {
    return { ...state, goal: null };
  }
  return state;
}

export interface SocketLike {
  onmessage: ((event: MessageEvent) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  close(): void;
}

interface EventSubHandlers {
  onWelcome: (sessionId: string) => Promise<void>;
  onNotification: (type: string, event: unknown) => void;
  onError: (error: Error) => void;
}

interface EventSubMessage {
  metadata: { message_type: string; subscription_type?: string };
  payload: {
    session?: { id: string; keepalive_timeout_seconds: number; reconnect_url: string };
    event?: unknown;
    subscription?: { type: string; status: string };
  };
}

export class EventSubConnection {
  private handlers: EventSubHandlers;
  private createSocket: (url: string) => SocketLike;
  private log: (message: string) => void;
  private socket: SocketLike | null = null;
  // session_reconnect で接続中の新しいソケット。welcome を受けたら socket と入れ替える
  private pending: SocketLike | null = null;
  private keepaliveTimer: ReturnType<typeof setTimeout> | null = null;
  private keepaliveMs = 0;
  private reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
  private stopped = false;

  constructor(handlers: EventSubHandlers, createSocket: (url: string) => SocketLike = (url) => new WebSocket(url), log = console.log) {
    this.handlers = handlers;
    this.createSocket = createSocket;
    this.log = log;
  }

  start(): void {
    this.stopped = false;
    this.socket = this.open(EVENTSUB_URL);
  }

  stop(): void {
    this.stopped = true;
    this.clearKeepalive();
    this.socket?.close();
    this.pending?.close();
    this.socket = null;
    this.pending = null;
  }

  private open(url: string): SocketLike {
    const socket = this.createSocket(url);
    socket.onmessage = (event) => {
      if (socket !== this.socket && socket !== this.pending) return;
      try {
        this.handleMessage(socket, JSON.parse(String(event.data)) as EventSubMessage);
      } catch (error) {
        this.log(`EventSub のメッセージを処理できませんでした: ${(error as Error).message}`);
      }
    };
    socket.onclose = () => {
      if (socket === this.pending) this.pending = null;
      if (socket !== this.socket || this.stopped) return;
      this.log('EventSub の接続が切れました。再接続します');
      this.restart();
    };
    return socket;
  }

  private handleMessage(socket: SocketLike, message: EventSubMessage): void {
    if (socket === this.socket) this.resetKeepalive();
    const { metadata, payload } = message;
    switch (metadata.message_type) {
      case 'session_welcome': {
        const session = payload.session!;
        this.keepaliveMs = session.keepalive_timeout_seconds * 1000 + KEEPALIVE_MARGIN_MS;
        if (socket === this.pending) {
          // 再接続先では購読が引き継がれるので、旧接続を閉じるだけでよい
          const previous = this.socket;
          this.socket = socket;
          this.pending = null;
          previous?.close();
        } else {
          this.handlers.onWelcome(session.id).then(
            () => {
              this.reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
            },
            (error: Error) => {
              if (!isRetryable(error)) return this.handlers.onError(error);
              if (socket !== this.socket) return;
              this.log(`購読に失敗しました。再接続します: ${error.message}`);
              this.restart();
            },
          );
        }
        this.resetKeepalive();
        break;
      }
      case 'notification':
        this.handlers.onNotification(metadata.subscription_type ?? '', payload.event);
        break;
      case 'session_reconnect':
        this.pending?.close();
        this.pending = this.open(payload.session!.reconnect_url);
        break;
      case 'revocation':
        this.handlers.onError(new Error(`購読が取り消されました: ${payload.subscription?.type} (${payload.subscription?.status})`));
        break;
    }
  }

  private resetKeepalive(): void {
    this.clearKeepalive();
    if (this.keepaliveMs === 0 || this.stopped) return;
    this.keepaliveTimer = setTimeout(() => {
      this.log('EventSub の keepalive が途絶えました。再接続します');
      this.restart();
    }, this.keepaliveMs);
  }

  private clearKeepalive(): void {
    if (this.keepaliveTimer) clearTimeout(this.keepaliveTimer);
    this.keepaliveTimer = null;
  }

  /** 新しいセッションで接続し直す（購読もやり直しになる） */
  private restart(): void {
    this.clearKeepalive();
    this.keepaliveMs = 0;
    const previous = this.socket;
    const pending = this.pending;
    this.socket = null;
    this.pending = null;
    previous?.close();
    pending?.close();
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(delay * 2, MAX_RECONNECT_DELAY_MS);
    setTimeout(() => {
      if (!this.stopped && !this.socket) this.socket = this.open(EVENTSUB_URL);
    }, delay);
  }
}

// ---- チャットの読み上げ ----

interface ChatMessageEvent {
  chatter_user_id?: string;
  chatter_user_login?: string;
  chatter_user_name?: string;
  message?: { text?: string };
  // 共有チャット（Shared Chat）で、ほかのチャンネルから届いたメッセージなら、そのチャンネルの ID
  source_broadcaster_user_id?: string | null;
}

export interface ChatSpeechContext {
  broadcasterId: string;
  // 挨拶済みの視聴者のユーザー ID（スクリプトの起動中だけメモリに持つ。保存しない）
  greeted: Set<string>;
  // 読み上げないアカウント（Nightbot などのボット）のログイン名。小文字
  ignoredLogins: Set<string>;
}

const MAX_CHAT_SPEECH_LENGTH = 100;
// 挨拶で読み上げる名前の長さ。表示名を文のようにして読ませる悪用を防ぐため短く切る
const MAX_SPOKEN_NAME_LENGTH = 20;
// URL らしいものを含むコメントは読まない（読み上げても聞き取れず、意図しないサイト名を読ませないため）。全角は NFKC で半角にしてから判定する
const URL_PATTERN = /https?:\/\/|www\.|\b[\w-]+\.(?:com|net|org|jp|tv|gg|io|ly|me|co|dev|app|xyz|info|link|live|be)\b/i;

// 文字（コードポイント）単位で切る。UTF-16 で切ると絵文字が途中で切れて文字化けするため
const truncate = (text: string, max: number) => Array.from(text).slice(0, max).join('');

/**
 * 挨拶で読み上げる名前に整える。全角・半角をそろえ、制御文字や書式文字を除き、同じ文字が 3 つ以上続くところは 2 つに縮め
 * （「ーーーー…」で長く鳴らすなどの悪用を防ぐ）、20 文字までに切る
 */
export function speakableName(name: string): string {
  const cleaned = name
    .normalize('NFKC')
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .replace(/(.)\1{2,}/gu, '$1$1')
    .replace(/\s+/g, ' ')
    .trim();
  return truncate(cleaned, MAX_SPOKEN_NAME_LENGTH);
}

/** 環境変数（カンマ区切りのログイン名）から、読み上げないアカウントの一覧を作る */
export const parseIgnoredLogins = (value: string | undefined): Set<string> =>
  new Set((value ?? '').split(',').map((login) => login.trim().toLowerCase()).filter((login) => login !== ''));

/**
 * チャットのメッセージから、読み上げる文を決める。読み上げないものは null。
 * - 配信者自身: コメント本文（`!` で始まるコマンドと URL を含むものは読まない。全角も半角にそろえてから判定する）
 * - 視聴者: 起動中に初めてコメントしたときだけ「〇〇さん、いらっしゃい！」（本文は読まない。名前は speakableName で整える）。
 *   挨拶した人は context.greeted に加える
 */
export function chatToSpeech(event: unknown, context: ChatSpeechContext): string | null {
  const chat = (event ?? {}) as ChatMessageEvent;
  const userId = chat.chatter_user_id;
  if (!userId) return null;
  // 共有チャットで、ほかのチャンネルから届いたものは読まない
  if (chat.source_broadcaster_user_id && chat.source_broadcaster_user_id !== context.broadcasterId) return null;

  if (userId === context.broadcasterId) {
    const text = (chat.message?.text ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
    if (text === '' || text.startsWith('!') || URL_PATTERN.test(text)) return null;
    return truncate(text, MAX_CHAT_SPEECH_LENGTH);
  }

  if (context.ignoredLogins.has((chat.chatter_user_login ?? '').toLowerCase()) || context.greeted.has(userId)) return null;
  // 表示名が整えると空になる（記号や制御文字だけなど）ときは、ログイン名（英数字）で呼ぶ
  const name = speakableName(chat.chatter_user_name ?? '') || speakableName(chat.chatter_user_login ?? '');
  if (name === '') return null;
  context.greeted.add(userId);
  return `${name}さん、いらっしゃい！`;
}

/** 読み上げキューに送る。アプリ側で読み上げが無効（409）なら送らなかったものとして false */
export async function publishSpeech(speechUrl: string, text: string, fetchFn: FetchFn = fetch): Promise<boolean> {
  const res = await fetchFn(speechUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (res.status === 409) return false;
  if (!res.ok) throw new Error(`${speechUrl} への送信に失敗しました: ${res.status}`);
  return true;
}

/**
 * チャットのメッセージを読み上げキューに送る。視聴者への挨拶を送れなかったとき（読み上げが無効・送信に失敗）は、
 * 挨拶済みから外して次のコメントでもう一度挨拶する（読み上げを途中で有効にしても、その前にコメントした人を取りこぼさない）
 */
export async function speakChatMessage(event: unknown, context: ChatSpeechContext, send: (text: string) => Promise<boolean>): Promise<void> {
  const userId = ((event ?? {}) as ChatMessageEvent).chatter_user_id ?? '';
  const greetedBefore = context.greeted.has(userId);
  const text = chatToSpeech(event, context);
  if (!text) return;
  // 送信中に同じ人がまたコメントしても二重に挨拶しないよう、挨拶済みには先に入れておき、送れなかったら外す
  const isGreeting = !greetedBefore && context.greeted.has(userId);
  let delivered = false;
  try {
    delivered = await send(text);
  } finally {
    if (isGreeting && !delivered) context.greeted.delete(userId);
  }
}

// ---- アプリへの送信 ----

export async function publishState(apiUrl: string, state: TwitchState, fetchFn: FetchFn = fetch): Promise<void> {
  const res = await fetchFn(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  });
  if (!res.ok) throw new Error(`${apiUrl} への送信に失敗しました: ${res.status}`);
}

async function main(): Promise<void> {
  const clientId = process.env.TWITCH_CLIENT_ID;
  if (!clientId) {
    console.error('[twitch] TWITCH_CLIENT_ID が未設定です。.env.local に設定してください（tools/twitch-eventsub/README.md 参照）');
    process.exit(1);
  }
  const apiUrl = process.env.TWITCH_API_URL ?? 'http://localhost:3000/api/twitch';
  const speechUrl = process.env.TWITCH_SPEECH_API_URL ?? new URL('/api/speech', apiUrl).toString();
  const log = (message: string) => console.log(`[twitch] ${message}`);

  const client = new TwitchClient({ clientId, tokenPath: process.env.TWITCH_TOKEN_PATH ?? DEFAULT_TOKEN_PATH, log });
  await client.authenticate();

  let state: TwitchState = { followerTotal: await client.getFollowerTotal(), goal: await client.getFollowerGoal(), lastFollowAt: null };
  const publish = () =>
    publishState(apiUrl, state).catch((error) => {
      log(`警告: ${(error as Error).message}。Next.js アプリ（pnpm dev / docker-compose up）が起動しているか確認してください`);
    });
  await publish();
  log(`フォロワー数: ${state.followerTotal}${state.goal ? ` / 目標: ${state.goal.target}` : ''}`);

  let syncing = false;
  setInterval(async () => {
    if (syncing) return;
    syncing = true;
    try {
      const followerTotal = await client.getFollowerTotal();
      const goal = await client.getFollowerGoal();
      // await 中に届いた通知（lastFollowAt など）を消さないよう、取得後の最新の state に反映する
      state = { ...state, followerTotal, goal };
    } catch (error) {
      log(`同期に失敗しました: ${(error as Error).message}`);
    } finally {
      syncing = false;
    }
    await publish();
  }, RESYNC_INTERVAL_MS);

  const chatContext: ChatSpeechContext = {
    broadcasterId: client.userId,
    greeted: new Set(),
    ignoredLogins: parseIgnoredLogins(process.env.TWITCH_SPEECH_IGNORE),
  };

  const connection = new EventSubConnection(
    {
      onWelcome: (sessionId) => client.subscribeAll(sessionId),
      onNotification: (type, event) => {
        if (type === 'channel.chat.message') {
          // 視聴者の名前やコメントはログに出さない
          speakChatMessage(event, chatContext, (text) => publishSpeech(speechUrl, text)).catch((error) => {
            log(`警告: 読み上げを送信できませんでした: ${(error as Error).message}`);
          });
          return;
        }
        state = applyNotification(state, type, event, Date.now());
        log(`${type} を受信しました（フォロワー数: ${state.followerTotal}）`);
        void publish();
      },
      onError: (error) => {
        console.error(`[twitch] ${error.message}`);
        process.exit(1);
      },
    },
    undefined,
    log,
  );
  connection.start();

  process.on('SIGINT', () => {
    connection.stop();
    process.exit(0);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[twitch] ${(error as Error).message}`);
    process.exit(1);
  });
}
