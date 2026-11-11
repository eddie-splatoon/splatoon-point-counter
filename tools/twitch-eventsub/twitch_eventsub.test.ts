// @vitest-environment node
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';

import {
  CLIP_CREATED_TELOP,
  CLIP_FAILED_TELOP,
  EVENTSUB_URL,
  EventSubConnection,
  HelixError,
  MutedOwnMessages,
  SCOPES,
  TwitchClient,
  applyNotification,
  chatToSpeech,
  clipFailureReason,
  createChatPostProcessor,
  createClipProcessor,
  loadToken,
  parseIgnoredLogins,
  publishSpeech,
  publishTelop,
  speakChatMessage,
  speakableName,
  pollDeviceToken,
  publishState,
  refreshAccessToken,
  saveToken,
  type ChatSpeechContext,
  type SocketLike,
  type TwitchState,
} from './twitch_eventsub';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const noSleep = () => Promise.resolve();
const silent = () => {};

const formOf = (init: RequestInit | undefined) => Object.fromEntries(init?.body as URLSearchParams);

let dir: string;
let tokenPath: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'twitch-eventsub-'));
  tokenPath = join(dir, 'data', 'twitch-token.json');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  vi.useRealTimers();
});

describe('token storage', () => {
  it('saves the token with owner-only permissions and loads it back', async () => {
    const token = { accessToken: 'a', refreshToken: 'r' };
    await saveToken(tokenPath, token);

    expect(await loadToken(tokenPath)).toEqual(token);
    expect((await stat(tokenPath)).mode & 0o777).toBe(0o600);
    expect((await stat(join(dir, 'data'))).mode & 0o777).toBe(0o700);
  });

  it('tightens the permissions of an existing token file', async () => {
    await mkdir(join(dir, 'data'));
    await writeFile(tokenPath, '{}', { mode: 0o644 });

    await saveToken(tokenPath, { accessToken: 'a', refreshToken: 'r' });

    expect((await stat(tokenPath)).mode & 0o777).toBe(0o600);
  });

  it('returns null when the file is missing or broken', async () => {
    expect(await loadToken(tokenPath)).toBeNull();
    await saveToken(tokenPath, { accessToken: 'a' } as never);
    expect(await loadToken(tokenPath)).toBeNull();
  });
});

describe('pollDeviceToken', () => {
  const code = { deviceCode: 'dev', userCode: 'USER', verificationUri: 'https://twitch.tv/activate', interval: 5, expiresIn: 30 };

  it('keeps polling while authorization is pending', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(json({ status: 400, message: 'authorization_pending' }, 400))
      .mockResolvedValueOnce(json({ access_token: 'a', refresh_token: 'r' }));

    expect(await pollDeviceToken('cid', code, fetchFn, noSleep)).toEqual({ accessToken: 'a', refreshToken: 'r' });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(formOf(fetchFn.mock.calls[0][1])).toEqual({
      client_id: 'cid',
      scopes: SCOPES.join(' '),
      device_code: 'dev',
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    });
  });

  it('fails when the user denies the request', async () => {
    const fetchFn = vi.fn().mockImplementation(async () => json({ status: 400, message: 'access_denied' }, 400));
    await expect(pollDeviceToken('cid', code, fetchFn, noSleep)).rejects.toThrow('access_denied');
  });

  it('gives up when the device code expires', async () => {
    const fetchFn = vi.fn().mockImplementation(async () => json({ status: 400, message: 'authorization_pending' }, 400));
    await expect(pollDeviceToken('cid', code, fetchFn, noSleep)).rejects.toThrow('有効期限');
    expect(fetchFn).toHaveBeenCalledTimes(6);
  });
});

describe('refreshAccessToken', () => {
  it('refreshes without a client secret', async () => {
    const fetchFn = vi.fn().mockImplementation(async () => json({ access_token: 'a2', refresh_token: 'r2' }));

    expect(await refreshAccessToken('cid', 'r1', fetchFn)).toEqual({ accessToken: 'a2', refreshToken: 'r2' });
    expect(formOf(fetchFn.mock.calls[0][1])).toEqual({ client_id: 'cid', grant_type: 'refresh_token', refresh_token: 'r1' });
  });
});

describe('TwitchClient', () => {
  const validated = () => json({ user_id: '123', login: 'eddie_splatoon', scopes: SCOPES });

  it('reuses a saved valid token', async () => {
    await saveToken(tokenPath, { accessToken: 'a', refreshToken: 'r' });
    const fetchFn = vi.fn().mockResolvedValueOnce(validated());
    const client = new TwitchClient({ clientId: 'cid', tokenPath, fetchFn, log: silent });

    await client.authenticate();

    expect(client.userId).toBe('123');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('refreshes an expired saved token', async () => {
    await saveToken(tokenPath, { accessToken: 'old', refreshToken: 'r' });
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(json({ status: 401 }, 401))
      .mockResolvedValueOnce(json({ access_token: 'new', refresh_token: 'r2' }))
      .mockResolvedValueOnce(validated());
    const client = new TwitchClient({ clientId: 'cid', tokenPath, fetchFn, log: silent });

    await client.authenticate();

    expect(client.userId).toBe('123');
    expect(await loadToken(tokenPath)).toEqual({ accessToken: 'new', refreshToken: 'r2' });
  });

  it('runs the device code flow when the saved token lacks scopes', async () => {
    await saveToken(tokenPath, { accessToken: 'old', refreshToken: 'r' });
    const log = vi.fn();
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(json({ user_id: '123', login: 'eddie_splatoon', scopes: ['channel:read:goals'] }))
      .mockResolvedValueOnce(json({ device_code: 'dev', user_code: 'USER', verification_uri: 'https://twitch.tv/activate', interval: 5, expires_in: 1800 }))
      .mockResolvedValueOnce(json({ access_token: 'new', refresh_token: 'r2' }))
      .mockResolvedValueOnce(validated());
    const client = new TwitchClient({ clientId: 'cid', tokenPath, fetchFn, sleep: noSleep, log });

    await client.authenticate();

    expect(log).toHaveBeenCalledWith(expect.stringContaining('USER'));
    expect(await loadToken(tokenPath)).toEqual({ accessToken: 'new', refreshToken: 'r2' });
  });

  describe('with an authenticated client', () => {
    const authenticated = async (fetchFn: Mock) => {
      await saveToken(tokenPath, { accessToken: 'a', refreshToken: 'r' });
      fetchFn.mockResolvedValueOnce(validated());
      const client = new TwitchClient({ clientId: 'cid', tokenPath, fetchFn, log: silent });
      await client.authenticate();
      return client;
    };

    it('sends auth headers and returns the follower total', async () => {
      const fetchFn = vi.fn();
      const client = await authenticated(fetchFn);
      fetchFn.mockResolvedValueOnce(json({ total: 42, data: [], pagination: {} }));

      expect(await client.getFollowerTotal()).toBe(42);
      const [url, init] = fetchFn.mock.calls[1];
      expect(url).toBe('https://api.twitch.tv/helix/channels/followers?broadcaster_id=123&first=1');
      expect(init.headers).toEqual({ Authorization: 'Bearer a', 'Client-Id': 'cid' });
    });

    it('refreshes the token once and retries on 401', async () => {
      const fetchFn = vi.fn();
      const client = await authenticated(fetchFn);
      fetchFn
        .mockResolvedValueOnce(json({ status: 401 }, 401))
        .mockResolvedValueOnce(json({ access_token: 'a2', refresh_token: 'r2' }))
        .mockResolvedValueOnce(json({ total: 7 }));

      expect(await client.getFollowerTotal()).toBe(7);
      expect(fetchFn.mock.calls[3][1].headers.Authorization).toBe('Bearer a2');
    });

    it('refreshes only once when concurrent requests get 401', async () => {
      const fetchFn = vi.fn();
      const client = await authenticated(fetchFn);
      fetchFn.mockImplementation(async (url: string, init: RequestInit) => {
        if (url.endsWith('/oauth2/token')) return json({ access_token: 'a2', refresh_token: 'r2' });
        const authorized = (init.headers as Record<string, string>).Authorization === 'Bearer a2';
        return authorized ? json({ total: 7, data: [] }) : json({ status: 401 }, 401);
      });

      await Promise.all([client.getFollowerTotal(), client.getFollowerGoal()]);

      const refreshes = fetchFn.mock.calls.filter(([url]) => String(url).endsWith('/oauth2/token'));
      expect(refreshes).toHaveLength(1);
    });

    it('throws a HelixError with the status code', async () => {
      const fetchFn = vi.fn();
      const client = await authenticated(fetchFn);
      fetchFn.mockResolvedValueOnce(json({ message: 'unavailable' }, 503));

      const error = await client.getFollowerTotal().catch((e) => e);
      expect(error).toBeInstanceOf(HelixError);
      expect(error.status).toBe(503);
    });

    it('picks the follower goal from creator goals', async () => {
      const fetchFn = vi.fn();
      const client = await authenticated(fetchFn);
      fetchFn.mockResolvedValueOnce(json({
        data: [
          { type: 'subscription', current_amount: 1, target_amount: 5 },
          { type: 'follower', current_amount: 10, target_amount: 20 },
        ],
      }));

      expect(await client.getFollowerGoal()).toEqual({ current: 10, target: 20 });
    });

    it('returns null when there is no follower goal', async () => {
      const fetchFn = vi.fn();
      const client = await authenticated(fetchFn);
      fetchFn.mockResolvedValueOnce(json({ data: [] }));

      expect(await client.getFollowerGoal()).toBeNull();
    });

    it('subscribes to follow and goal events on the websocket session', async () => {
      const fetchFn = vi.fn();
      const client = await authenticated(fetchFn);
      fetchFn.mockImplementation(async () => json({ data: [] }, 202));

      await client.subscribeAll('session-1');

      const bodies = fetchFn.mock.calls.slice(1).map(([, init]) => JSON.parse(init.body));
      expect(bodies.map((b) => b.type)).toEqual(['channel.follow', 'channel.goal.begin', 'channel.goal.progress', 'channel.goal.end', 'channel.chat.message']);
      expect(bodies[0]).toMatchObject({
        version: '2',
        condition: { broadcaster_user_id: '123', moderator_user_id: '123' },
        transport: { method: 'websocket', session_id: 'session-1' },
      });
    });

    it('subscribes to the chat as the broadcaster', async () => {
      const fetchFn = vi.fn();
      const client = await authenticated(fetchFn);
      fetchFn.mockImplementation(async () => json({ data: [] }, 202));

      await client.subscribeAll('session-1');

      const chat = fetchFn.mock.calls.slice(1).map(([, init]) => JSON.parse(init.body)).find((b) => b.type === 'channel.chat.message');
      expect(chat).toMatchObject({ version: '1', condition: { broadcaster_user_id: '123', user_id: '123' } });
    });

    it('creates a clip of the broadcast', async () => {
      const fetchFn = vi.fn();
      const client = await authenticated(fetchFn);
      fetchFn.mockResolvedValueOnce(json({ data: [{ id: 'FunnyClip', edit_url: 'https://clips.twitch.tv/FunnyClip/edit' }] }, 202));

      expect(await client.createClip()).toEqual({ clipId: 'FunnyClip', editUrl: 'https://clips.twitch.tv/FunnyClip/edit' });
      const [url, init] = fetchFn.mock.calls[1];
      expect(url).toBe('https://api.twitch.tv/helix/clips?broadcaster_id=123');
      expect(init.method).toBe('POST');
    });

    it('throws a HelixError when the clip cannot be created', async () => {
      const fetchFn = vi.fn();
      const client = await authenticated(fetchFn);
      fetchFn.mockResolvedValueOnce(json({ message: 'not live' }, 404));

      const error = await client.createClip().catch((e) => e);
      expect(error).toBeInstanceOf(HelixError);
      expect(error.status).toBe(404);
    });

    it('throws when the clip response is unexpected', async () => {
      const fetchFn = vi.fn();
      const client = await authenticated(fetchFn);
      fetchFn.mockResolvedValueOnce(json({ data: [] }, 202));

      await expect(client.createClip()).rejects.toThrow('クリップの作成結果');
    });

    it('posts a chat message as the broadcaster', async () => {
      const fetchFn = vi.fn();
      const client = await authenticated(fetchFn);
      fetchFn.mockResolvedValueOnce(json({ data: [{ message_id: 'm1', is_sent: true }] }));

      await client.sendChatMessage('ナイス!!');
      const [url, init] = fetchFn.mock.calls[1];
      expect(url).toBe('https://api.twitch.tv/helix/chat/messages');
      expect(init.method).toBe('POST');
      expect(init.headers['Content-Type']).toBe('application/json');
      expect(JSON.parse(init.body)).toEqual({ broadcaster_id: '123', sender_id: '123', message: 'ナイス!!' });
    });

    it('throws when the chat message is dropped', async () => {
      const fetchFn = vi.fn();
      const client = await authenticated(fetchFn);
      fetchFn.mockResolvedValueOnce(json({ data: [{ message_id: '', is_sent: false, drop_reason: { code: 'msg_duplicate', message: 'duplicate' } }] }));

      await expect(client.sendChatMessage('ナイス!!')).rejects.toThrow('duplicate');
    });

    it('throws when a subscription is rejected', async () => {
      const fetchFn = vi.fn();
      const client = await authenticated(fetchFn);
      fetchFn.mockResolvedValueOnce(json({ message: 'missing scope' }, 403));

      await expect(client.subscribeAll('session-1')).rejects.toThrow('403');
    });
  });
});

describe('applyNotification', () => {
  const state: TwitchState = { followerTotal: 10, goal: { current: 10, target: 20 }, lastFollowAt: null };

  it('counts a follow without keeping the follower name', () => {
    const next = applyNotification(state, 'channel.follow', { user_name: 'someone' }, 1000);
    expect(next).toEqual({ ...state, followerTotal: 11, lastFollowAt: 1000 });
  });

  it.each(['channel.goal.begin', 'channel.goal.progress'])('updates the follower goal on %s', (type) => {
    const next = applyNotification(state, type, { type: 'follower', current_amount: 11, target_amount: 30 }, 1000);
    expect(next.goal).toEqual({ current: 11, target: 30 });
  });

  it('clears the follower goal when it ends', () => {
    expect(applyNotification(state, 'channel.goal.end', { type: 'follower' }, 1000).goal).toBeNull();
  });

  it('ignores goals of other types', () => {
    expect(applyNotification(state, 'channel.goal.end', { type: 'subscription' }, 1000)).toBe(state);
  });
});

class FakeSocket implements SocketLike {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  closed = false;
  constructor(public url: string) {}
  close() {
    if (this.closed) return;
    this.closed = true;
    this.onclose?.({} as CloseEvent);
  }
  receive(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) } as MessageEvent);
  }
}

const welcome = (id: string) => ({
  metadata: { message_type: 'session_welcome' },
  payload: { session: { id, keepalive_timeout_seconds: 10, reconnect_url: null } },
});

describe('EventSubConnection', () => {
  const setup = () => {
    const sockets: FakeSocket[] = [];
    const handlers = { onWelcome: vi.fn().mockResolvedValue(undefined), onNotification: vi.fn(), onError: vi.fn() };
    const connection = new EventSubConnection(handlers, (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    }, silent);
    connection.start();
    return { sockets, handlers, connection };
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('subscribes on welcome and forwards notifications', () => {
    const { sockets, handlers } = setup();
    expect(sockets[0].url).toBe(EVENTSUB_URL);

    sockets[0].receive(welcome('s1'));
    sockets[0].receive({ metadata: { message_type: 'notification', subscription_type: 'channel.follow' }, payload: { event: { user_id: '1' } } });

    expect(handlers.onWelcome).toHaveBeenCalledWith('s1');
    expect(handlers.onNotification).toHaveBeenCalledWith('channel.follow', { user_id: '1' });
  });

  it('reports subscription failures that retrying cannot fix', async () => {
    const { sockets, handlers } = setup();
    const error = new HelixError(403, 'missing scope');
    handlers.onWelcome.mockRejectedValueOnce(error);

    sockets[0].receive(welcome('s1'));
    await vi.waitFor(() => expect(handlers.onError).toHaveBeenCalledWith(error));
    expect(sockets[0].closed).toBe(false);
  });

  it.each([
    ['a network error', new TypeError('fetch failed')],
    ['a server error', new HelixError(503, 'unavailable')],
    ['rate limiting', new HelixError(429, 'too many requests')],
  ])('reconnects and subscribes again after %s', async (_, error) => {
    const { sockets, handlers } = setup();
    handlers.onWelcome.mockRejectedValueOnce(error);

    sockets[0].receive(welcome('s1'));
    await vi.waitFor(() => expect(sockets[0].closed).toBe(true));
    vi.advanceTimersByTime(1_000);
    sockets[1].receive(welcome('s2'));

    expect(handlers.onError).not.toHaveBeenCalled();
    expect(handlers.onWelcome).toHaveBeenLastCalledWith('s2');
  });

  it('ignores messages that are not valid JSON', () => {
    const { sockets, handlers } = setup();

    sockets[0].onmessage?.({ data: 'not json' } as MessageEvent);
    sockets[0].receive({ metadata: { message_type: 'session_welcome' }, payload: {} });
    sockets[0].receive(welcome('s1'));

    expect(handlers.onWelcome).toHaveBeenCalledWith('s1');
  });

  it('drops a pending reconnect when the connection is restarted', () => {
    const { sockets, handlers } = setup();
    sockets[0].receive(welcome('s1'));
    sockets[0].receive({ metadata: { message_type: 'session_reconnect' }, payload: { session: { id: 's1', reconnect_url: 'wss://reconnect' } } });

    vi.advanceTimersByTime(15_000);
    expect(sockets[1].closed).toBe(true);
    vi.advanceTimersByTime(1_000);
    expect(sockets).toHaveLength(3);

    sockets[1].receive(welcome('s1'));
    sockets[2].receive(welcome('s2'));
    expect(sockets[2].closed).toBe(false);
    expect(handlers.onWelcome).toHaveBeenLastCalledWith('s2');
  });

  it('keeps the current connection when a pending reconnect closes before welcome', () => {
    const { sockets, handlers } = setup();
    sockets[0].receive(welcome('s1'));
    sockets[0].receive({ metadata: { message_type: 'session_reconnect' }, payload: { session: { id: 's1', reconnect_url: 'wss://reconnect' } } });

    sockets[1].close();
    vi.advanceTimersByTime(5_000);

    expect(sockets).toHaveLength(2);
    expect(sockets[0].closed).toBe(false);
    sockets[0].receive({ metadata: { message_type: 'notification', subscription_type: 'channel.follow' }, payload: { event: {} } });
    expect(handlers.onNotification).toHaveBeenCalledTimes(1);
  });

  it('switches to the reconnect URL without subscribing again', () => {
    const { sockets, handlers } = setup();
    sockets[0].receive(welcome('s1'));

    sockets[0].receive({ metadata: { message_type: 'session_reconnect' }, payload: { session: { id: 's1', reconnect_url: 'wss://reconnect' } } });
    expect(sockets[1].url).toBe('wss://reconnect');
    sockets[1].receive(welcome('s1'));

    expect(sockets[0].closed).toBe(true);
    expect(handlers.onWelcome).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10_000);
    expect(sockets).toHaveLength(2);

    sockets[1].receive({ metadata: { message_type: 'notification', subscription_type: 'channel.follow' }, payload: { event: {} } });
    expect(handlers.onNotification).toHaveBeenCalledTimes(1);
  });

  it('reconnects with a new session when keepalive messages stop', () => {
    const { sockets, handlers } = setup();
    sockets[0].receive(welcome('s1'));

    vi.advanceTimersByTime(14_000);
    sockets[0].receive({ metadata: { message_type: 'session_keepalive' }, payload: {} });
    vi.advanceTimersByTime(14_000);
    expect(sockets).toHaveLength(1);

    vi.advanceTimersByTime(1_000 + 1_000);
    expect(sockets[0].closed).toBe(true);
    expect(sockets).toHaveLength(2);
    sockets[1].receive(welcome('s2'));
    expect(handlers.onWelcome).toHaveBeenLastCalledWith('s2');
  });

  it('backs off when the connection keeps dropping', () => {
    const { sockets } = setup();

    sockets[0].close();
    vi.advanceTimersByTime(1_000);
    expect(sockets).toHaveLength(2);

    sockets[1].close();
    vi.advanceTimersByTime(1_000);
    expect(sockets).toHaveLength(2);
    vi.advanceTimersByTime(1_000);
    expect(sockets).toHaveLength(3);
  });

  it('reports revoked subscriptions', () => {
    const { sockets, handlers } = setup();
    sockets[0].receive({ metadata: { message_type: 'revocation' }, payload: { subscription: { type: 'channel.follow', status: 'authorization_revoked' } } });
    expect(handlers.onError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('authorization_revoked') }));
  });

  it('does not reconnect after stop', () => {
    const { sockets, connection } = setup();
    sockets[0].receive(welcome('s1'));

    connection.stop();
    vi.advanceTimersByTime(120_000);

    expect(sockets).toHaveLength(1);
  });
});

describe('chatToSpeech', () => {
  const context = (): ChatSpeechContext => ({ broadcasterId: '123', greeted: new Set(), ignoredLogins: new Set(['nightbot']) });
  const chat = (overrides: Record<string, unknown> = {}) => ({
    chatter_user_id: '999',
    chatter_user_login: 'viewer_a',
    chatter_user_name: 'ViewerA',
    message: { text: 'こんにちは！初見です' },
    source_broadcaster_user_id: null,
    ...overrides,
  });

  it('does not read an own message that was muted, only once', () => {
    const muted = new MutedOwnMessages();
    muted.add('ナイス！！');
    const ctx = { ...context(), mutedOwnMessages: muted };
    const own = chat({ chatter_user_id: '123', message: { text: 'ナイス!!' } });

    expect(chatToSpeech(own, ctx)).toBeNull();
    expect(chatToSpeech(own, ctx)).toBe('ナイス!!');
  });

  it('greets a viewer by name on their first message without reading the message', () => {
    expect(chatToSpeech(chat(), context())).toBe('ViewerAさん、いらっしゃい！');
  });

  it('greets each viewer only once', () => {
    const ctx = context();
    chatToSpeech(chat(), ctx);

    expect(chatToSpeech(chat({ message: { text: '2回目' } }), ctx)).toBeNull();
    expect(chatToSpeech(chat({ chatter_user_id: '1000', chatter_user_name: 'ViewerB' }), ctx)).toBe('ViewerBさん、いらっしゃい！');
  });

  it('falls back to the login name when the display name is empty', () => {
    expect(chatToSpeech(chat({ chatter_user_name: '' }), context())).toBe('viewer_aさん、いらっしゃい！');
  });

  it('shortens and cleans a display name used to read something else', () => {
    expect(chatToSpeech(chat({ chatter_user_name: '配信者はこれからとても大事なお知らせを読み上げます' }), context()))
      .toBe('配信者はこれからとても大事なお知らせを読さん、いらっしゃい！');
  });

  it('falls back to the login name when the display name has nothing speakable', () => {
    expect(chatToSpeech(chat({ chatter_user_name: '\u200b\u200b' }), context())).toBe('viewer_aさん、いらっしゃい！');
  });

  it('ignores bots in the ignore list regardless of case', () => {
    expect(chatToSpeech(chat({ chatter_user_login: 'Nightbot' }), context())).toBeNull();
  });

  it('reads the broadcaster\'s own message', () => {
    expect(chatToSpeech(chat({ chatter_user_id: '123', message: { text: '  次は\nキケン度MAX  ' } }), context())).toBe('次は キケン度MAX');
  });

  it('truncates long messages from the broadcaster', () => {
    expect(chatToSpeech(chat({ chatter_user_id: '123', message: { text: 'あ'.repeat(150) } }), context())).toBe('あ'.repeat(100));
  });

  it('does not cut an emoji in half when truncating', () => {
    const text = `${'あ'.repeat(99)}🦑🦑`;
    expect(chatToSpeech(chat({ chatter_user_id: '123', message: { text } }), context())).toBe(`${'あ'.repeat(99)}🦑`);
  });

  it.each([
    ['a command', '!uptime'],
    ['a URL', '配信はこちら https://example.com'],
    ['a bare domain', 'twitch.tv/eddie を見てね'],
    ['a full-width domain', 'ｅｘａｍｐｌｅ．ｃｏｍ を見てね'],
    ['another TLD', 'example.dev を見てね'],
    ['a full-width command', '！uptime'],
    ['an empty message', '  '],
  ])('does not read the broadcaster\'s message with %s', (_, text) => {
    expect(chatToSpeech(chat({ chatter_user_id: '123', message: { text } }), context())).toBeNull();
  });

  it('ignores messages from other channels in a shared chat', () => {
    const ctx = context();
    expect(chatToSpeech(chat({ source_broadcaster_user_id: '555' }), ctx)).toBeNull();
    expect(ctx.greeted.size).toBe(0);
  });

  it('ignores events without a chatter', () => {
    expect(chatToSpeech({}, context())).toBeNull();
    expect(chatToSpeech(null, context())).toBeNull();
  });
});

describe('speakChatMessage', () => {
  const context = (): ChatSpeechContext => ({ broadcasterId: '123', greeted: new Set(), ignoredLogins: new Set() });
  const viewer = { chatter_user_id: '999', chatter_user_login: 'viewer_a', chatter_user_name: 'ViewerA', message: { text: 'こんにちは' } };

  it('sends the greeting and remembers the viewer', async () => {
    const ctx = context();
    const send = vi.fn().mockResolvedValue(true);

    await speakChatMessage(viewer, ctx, send);
    await speakChatMessage(viewer, ctx, send);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('ViewerAさん、いらっしゃい！');
  });

  it('greets again next time when reading aloud was disabled', async () => {
    const ctx = context();
    const send = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    await speakChatMessage(viewer, ctx, send);
    expect(ctx.greeted.has('999')).toBe(false);

    await speakChatMessage(viewer, ctx, send);
    expect(send).toHaveBeenCalledTimes(2);
    expect(ctx.greeted.has('999')).toBe(true);
  });

  it('greets again next time when sending failed', async () => {
    const ctx = context();
    await expect(speakChatMessage(viewer, ctx, vi.fn().mockRejectedValue(new Error('500')))).rejects.toThrow('500');
    expect(ctx.greeted.has('999')).toBe(false);
  });

  it('does not greet twice while the first greeting is being sent', async () => {
    const ctx = context();
    let finish: (value: boolean) => void = () => {};
    const send = vi.fn().mockImplementationOnce(() => new Promise<boolean>((resolve) => { finish = resolve; }));

    const first = speakChatMessage(viewer, ctx, send);
    await speakChatMessage(viewer, ctx, send);
    finish(true);
    await first;

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('does not touch the greeted list for the broadcaster\'s own messages', async () => {
    const ctx = context();
    await speakChatMessage({ chatter_user_id: '123', message: { text: '次いきます' } }, ctx, vi.fn().mockResolvedValue(false));
    expect(ctx.greeted.size).toBe(0);
  });
});

describe('speakableName', () => {
  it.each([
    ['full-width letters', 'ＶｉｅｗｅｒＡ', 'ViewerA'],
    ['control and format characters', 'Vie\u0007wer\u200bA', 'ViewerA'],
    ['long runs of the same character', 'イカーーーーーー', 'イカーー'],
    ['surrounding and repeated spaces', '  イカ  ちゃん ', 'イカ ちゃん'],
  ])('handles %s', (_, name, expected) => {
    expect(speakableName(name)).toBe(expected);
  });

  it('keeps at most 20 characters', () => {
    expect(speakableName('あいうえおかきくけこさしすせそたちつてとなにぬねの')).toBe('あいうえおかきくけこさしすせそたちつてと');
  });
});

describe('parseIgnoredLogins', () => {
  it('splits, trims and lowercases the logins', () => {
    expect(parseIgnoredLogins(' Nightbot, StreamElements ,,')).toEqual(new Set(['nightbot', 'streamelements']));
    expect(parseIgnoredLogins(undefined)).toEqual(new Set());
  });
});

describe('publishSpeech', () => {
  it('posts the text as JSON', async () => {
    const fetchFn = vi.fn().mockImplementation(async () => json({}));

    expect(await publishSpeech('http://localhost:3000/api/speech', 'こんにちは', fetchFn)).toBe(true);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/speech');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body)).toEqual({ text: 'こんにちは' });
  });

  it('returns false when reading aloud is disabled in the app', async () => {
    const fetchFn = vi.fn().mockImplementation(async () => json({}, 409));
    expect(await publishSpeech('http://x', 'a', fetchFn)).toBe(false);
  });

  it('throws when the app rejects the request', async () => {
    const fetchFn = vi.fn().mockImplementation(async () => json({}, 500));
    await expect(publishSpeech('http://x', 'a', fetchFn)).rejects.toThrow('500');
  });
});

describe('scopes', () => {
  it('includes the scope to create clips', () => {
    expect(SCOPES).toContain('clips:edit');
  });

  it('includes the scope to post chat messages', () => {
    expect(SCOPES).toContain('user:write:chat');
  });
});

describe('createClipProcessor', () => {
  const clipApiUrl = 'http://localhost:3000/api/clip';
  const clip = { clipId: 'FunnyClip', editUrl: 'https://clips.twitch.tv/FunnyClip/edit' };

  const setup = (pending: { id: number }[], createClip: () => Promise<typeof clip>) => {
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => (init?.method === 'PATCH' ? json({}) : json({ clips: pending })));
    const announce = vi.fn(async () => {});
    const process = createClipProcessor({ clipApiUrl, createClip, announce, fetchFn: fetchFn as unknown as typeof fetch, log: silent });
    const patches = () => fetchFn.mock.calls.filter(([, init]) => init?.method === 'PATCH').map(([, init]) => JSON.parse(String(init!.body)));
    return { fetchFn, announce, process, patches };
  };

  it('creates a clip for each pending request and reports the result', async () => {
    const createClip = vi.fn(async () => clip);
    const { fetchFn, announce, process, patches } = setup([{ id: 1 }, { id: 2 }], createClip);

    await process();

    expect(fetchFn.mock.calls[0][0]).toBe(`${clipApiUrl}?status=pending`);
    expect(createClip).toHaveBeenCalledTimes(2);
    expect(patches()).toEqual([{ id: 1, status: 'created', ...clip }, { id: 2, status: 'created', ...clip }]);
    expect(announce).toHaveBeenCalledWith(CLIP_CREATED_TELOP);
  });

  it('reports a failure and announces it', async () => {
    const { announce, process, patches } = setup([{ id: 1 }], async () => {
      throw new HelixError(404, 'not live');
    });

    await process();

    expect(patches()).toEqual([{ id: 1, status: 'failed', error: '配信していないため作れませんでした' }]);
    expect(announce).toHaveBeenCalledWith(CLIP_FAILED_TELOP);
  });

  it('does not create a second clip for a request it already tried', async () => {
    const createClip = vi.fn(async () => clip);
    const { fetchFn, process } = setup([{ id: 1 }], createClip);
    fetchFn.mockImplementation(async (_url: string, init?: RequestInit) => (init?.method === 'PATCH' ? json({}, 503) : json({ clips: [{ id: 1 }] })));

    await expect(process()).rejects.toThrow('503');
    await process();

    expect(createClip).toHaveBeenCalledTimes(1);
  });

  it('does not run while the previous run is in progress', async () => {
    let finish: (value: typeof clip) => void = () => {};
    const createClip = vi.fn(() => new Promise<typeof clip>((resolve) => {
      finish = resolve;
    }));
    const { process } = setup([{ id: 1 }], createClip);

    const first = process();
    await vi.waitFor(() => expect(createClip).toHaveBeenCalled());
    await process();
    finish(clip);
    await first;

    expect(createClip).toHaveBeenCalledTimes(1);
  });

  it('keeps going when the announcement fails', async () => {
    const { announce, process, patches } = setup([{ id: 1 }], async () => clip);
    announce.mockRejectedValue(new Error('down'));

    await process();

    expect(patches()).toHaveLength(1);
  });

  it('throws when the pending requests cannot be fetched', async () => {
    const { fetchFn, process } = setup([], async () => clip);
    fetchFn.mockResolvedValueOnce(json({}, 500));

    await expect(process()).rejects.toThrow('500');
  });
});

describe('MutedOwnMessages', () => {
  it('forgets messages after a while and can be undone', () => {
    let now = 0;
    const muted = new MutedOwnMessages(() => now);
    const undo = muted.add('おしい');
    muted.add('満潮きた');

    undo();
    expect(muted.consume('おしい')).toBe(false);
    now = 30_000;
    expect(muted.consume('満潮きた')).toBe(false);
  });
});

describe('createChatPostProcessor', () => {
  const telopUrl = 'http://localhost:3000/api/telop';
  type Post = { id: number; text: string; speak?: boolean; picked: boolean };

  const setup = (posts: Post[], sendChatMessage: (text: string) => Promise<void>, patchStatus = 200, mutedOwnMessages?: MutedOwnMessages) => {
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => (init?.method === 'PATCH' ? json({}, patchStatus) : json({ chatPosts: posts.map((p) => ({ speak: true, ...p })) })));
    const process = createChatPostProcessor({ telopUrl, sendChatMessage, mutedOwnMessages, fetchFn: fetchFn as unknown as typeof fetch, log: silent });
    const patches = () => fetchFn.mock.calls.filter(([, init]) => init?.method === 'PATCH').map(([, init]) => JSON.parse(String(init!.body)));
    return { fetchFn, process, patches };
  };

  it('picks each post, writes it to chat and reports it as sent', async () => {
    const send = vi.fn(async () => {});
    const { fetchFn, process, patches } = setup([{ id: 1, text: 'ナイス!!', picked: false }, { id: 2, text: 'おしい', picked: false }], send);

    await process();

    expect(fetchFn.mock.calls[0][0]).toBe(`${telopUrl}?view=chat`);
    expect(send.mock.calls).toEqual([['ナイス!!'], ['おしい']]);
    expect(patches()).toEqual([
      { chatId: 1, status: 'picked' },
      { chatId: 1, status: 'sent' },
      { chatId: 2, status: 'picked' },
      { chatId: 2, status: 'sent' },
    ]);
  });

  it('mutes the own message of a telop that is not read aloud before writing it', async () => {
    const muted = new MutedOwnMessages();
    const mutedWhileSending: boolean[] = [];
    const send = vi.fn(async (text: string) => {
      mutedWhileSending.push(muted.consume(text));
    });
    const { process } = setup([{ id: 1, text: 'おしい', speak: false, picked: false }, { id: 2, text: 'ナイス!!', speak: true, picked: false }], send, 200, muted);

    await process();

    expect(mutedWhileSending).toEqual([true, false]);
  });

  it('unmutes the message when it cannot be written', async () => {
    const muted = new MutedOwnMessages();
    const { process } = setup([{ id: 1, text: 'おしい', speak: false, picked: false }], async () => {
      throw new Error('dropped');
    }, 200, muted);

    await process();

    expect(muted.consume('おしい')).toBe(false);
  });

  it('reports a failure so that the app reads the telop aloud', async () => {
    const { process, patches } = setup([{ id: 1, text: 'ナイス!!', picked: false }], async () => {
      throw new Error('dropped');
    });

    await process();

    expect(patches()).toEqual([{ chatId: 1, status: 'picked' }, { chatId: 1, status: 'failed' }]);
  });

  it('does not write a post that expired before it was picked', async () => {
    const send = vi.fn(async () => {});
    const { process, patches } = setup([{ id: 1, text: 'ナイス!!', picked: false }], send, 404);

    await process();

    expect(send).not.toHaveBeenCalled();
    expect(patches()).toEqual([{ chatId: 1, status: 'picked' }]);
  });

  it('skips posts already picked and does not retry a post it tried', async () => {
    const send = vi.fn(async () => {});
    const { fetchFn, process } = setup([{ id: 1, text: 'ナイス!!', picked: false }, { id: 2, text: 'おしい', picked: true }], send);
    fetchFn.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method !== 'PATCH') return json({ chatPosts: [{ id: 1, text: 'ナイス!!', picked: false }, { id: 2, text: 'おしい', picked: true }] });
      return JSON.parse(String(init.body)).status === 'sent' ? json({}, 503) : json({});
    });

    await expect(process()).rejects.toThrow('503');
    await process();

    expect(send.mock.calls).toEqual([['ナイス!!']]);
  });

  it('does not run while the previous run is in progress', async () => {
    let finish: () => void = () => {};
    const send = vi.fn(() => new Promise<void>((resolve) => {
      finish = resolve;
    }));
    const { process } = setup([{ id: 1, text: 'ナイス!!', picked: false }], send);

    const first = process();
    await vi.waitFor(() => expect(send).toHaveBeenCalled());
    await process();
    finish();
    await first;

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('throws when the posts cannot be fetched', async () => {
    const { fetchFn, process } = setup([], async () => {});
    fetchFn.mockResolvedValueOnce(json({}, 500));

    await expect(process()).rejects.toThrow('500');
  });
});

describe('clipFailureReason', () => {
  it('explains common failures', () => {
    expect(clipFailureReason(new HelixError(404, 'x'))).toContain('配信していない');
    expect(clipFailureReason(new HelixError(403, 'x'))).toContain('設定');
    expect(clipFailureReason(new Error('boom'))).toBe('boom');
  });
});

describe('publishTelop', () => {
  it('shows the telop and asks to speak it', async () => {
    const fetchFn = vi.fn(async () => json({}));
    await publishTelop('http://localhost:3000/api/telop', 'クリップしました！', fetchFn as unknown as typeof fetch);

    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://localhost:3000/api/telop');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(String(init.body))).toEqual({ text: 'クリップしました！', speak: true });
  });

  it('throws when the telop cannot be shown', async () => {
    const fetchFn = vi.fn(async () => json({}, 500));
    await expect(publishTelop('http://localhost:3000/api/telop', 'x', fetchFn as unknown as typeof fetch)).rejects.toThrow('500');
  });
});

describe('publishState', () => {
  it('posts the state as JSON', async () => {
    const fetchFn = vi.fn().mockImplementation(async () => json({}));
    const state = { followerTotal: 1, goal: null, lastFollowAt: null };

    await publishState('http://localhost:3000/api/twitch', state, fetchFn);

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/twitch');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body)).toEqual(state);
  });

  it('throws when the app rejects the request', async () => {
    const fetchFn = vi.fn().mockImplementation(async () => json({}, 500));
    await expect(publishState('http://x', { followerTotal: 1, goal: null, lastFollowAt: null }, fetchFn)).rejects.toThrow('500');
  });
});

it('keeps the token file out of git', async () => {
  const gitignore = await readFile(join(__dirname, '../../.gitignore'), 'utf8');
  expect(gitignore.split('\n')).toContain('data/');
});
