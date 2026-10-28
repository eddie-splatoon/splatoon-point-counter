// @vitest-environment node
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';

import {
  EVENTSUB_URL,
  EventSubConnection,
  SCOPES,
  TwitchClient,
  applyNotification,
  loadToken,
  pollDeviceToken,
  publishState,
  refreshAccessToken,
  saveToken,
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
      expect(bodies.map((b) => b.type)).toEqual(['channel.follow', 'channel.goal.begin', 'channel.goal.progress', 'channel.goal.end']);
      expect(bodies[0]).toMatchObject({
        version: '2',
        condition: { broadcaster_user_id: '123', moderator_user_id: '123' },
        transport: { method: 'websocket', session_id: 'session-1' },
      });
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

  it('reports subscription failures', async () => {
    const { sockets, handlers } = setup();
    handlers.onWelcome.mockRejectedValueOnce(new Error('403'));

    sockets[0].receive(welcome('s1'));
    await vi.waitFor(() => expect(handlers.onError).toHaveBeenCalledWith(new Error('403')));
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
