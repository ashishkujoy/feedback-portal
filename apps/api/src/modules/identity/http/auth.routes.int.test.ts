import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../../../test/test-db.ts';
import { createBaseApp } from '../../../app.ts';
import type { GoogleAuth, GoogleIdentity } from '../application/google-auth.ts';
import { hashToken } from '../application/session-token.ts';
import { createSessions } from '../application/sessions.ts';
import { parseEmail } from '../domain/email.ts';
import { createUser, deactivate, signIn, type User } from '../domain/user.ts';
import { newUserId } from '../domain/user-id.ts';
import { createSessionRepository } from '../infrastructure/drizzle-session-repository.ts';
import { createUserRepository } from '../infrastructure/drizzle-user-repository.ts';
import { sessions as sessionsTable } from '../infrastructure/schema.ts';
import { authRoutes } from './auth.routes.ts';

const testDb = useTestDb();
const db = () => testDb.handle.db;
const users = () => createUserRepository(db());

const now = new Date('2026-03-01T10:00:00.000Z');
const webAppUrl = 'http://web.test';
const failureUrl = `${webAppUrl}/login?error=sign_in_failed`;
const state = 'state-123';
const verifier = 'verifier-456';

const identity = (overrides: Partial<GoogleIdentity> = {}): GoogleIdentity => ({
  sub: 'google-sub-1',
  email: 'mentor@example.com',
  emailVerified: true,
  name: 'Name From Google',
  picture: 'https://example.com/avatar.png',
  ...overrides,
});

type Exchange = GoogleAuth['exchange'];

/** A Google that never leaves the process; `exchange` is what the callback receives. */
const fakeGoogle = (
  exchange: Exchange = () => Promise.resolve({ ok: true, identity: identity() }),
) => {
  const calls: [string, string][] = [];
  const google: GoogleAuth = {
    start: () => ({ url: new URL('https://google.test/auth?x=1'), state, codeVerifier: verifier }),
    exchange: (code, codeVerifier) => {
      calls.push([code, codeVerifier]);
      return exchange(code, codeVerifier);
    },
  };
  return { google, calls };
};

const appWith = (googleAuth: GoogleAuth | null, secureCookies = false, trustProxy = false) =>
  createBaseApp().route(
    '/auth',
    authRoutes({
      users: users(),
      sessions: createSessions({ sessions: createSessionRepository(db()), now: () => now }),
      googleAuth,
      webAppUrl,
      secureCookies,
      trustProxy,
      now: () => now,
    }),
  );

const flowCookies = (prefix = '') =>
  `${prefix}oauth_state=${state}; ${prefix}oauth_verifier=${verifier}`;

const callback = (
  app: ReturnType<typeof appWith>,
  query = `code=the-code&state=${state}`,
  cookie = flowCookies(),
) => app.request(`/auth/google/callback?${query}`, { headers: { cookie, 'user-agent': 'ua/1' } });

/** A sign-in through nginx, which set X-Real-IP; the api trusts it only with `trustProxy`. */
const signInFromProxy = (trustProxy: boolean) =>
  appWith(fakeGoogle().google, false, trustProxy).request(
    `/auth/google/callback?code=the-code&state=${state}`,
    { headers: { cookie: flowCookies(), 'x-real-ip': '203.0.113.7' } },
  );

const setCookies = (response: Response): string[] => response.headers.getSetCookie();

const savedUser = async (overrides: { active?: boolean; googleSub?: string } = {}) => {
  let user: User = createUser({
    id: newUserId(),
    email: 'Mentor@Example.com',
    name: 'Name From Admin',
    roles: ['mentor'],
    grantedBy: null,
    now: new Date('2026-01-01T00:00:00.000Z'),
  });
  if (overrides.googleSub) {
    user = signIn(user, { googleSub: overrides.googleSub, avatarUrl: null, now: user.createdAt });
  }
  if (overrides.active === false) user = deactivate(user, { by: newUserId(), now: user.createdAt });
  await users().save(user);
  return user;
};

const sessionRows = () => db().select().from(sessionsTable);

const expectRejected = async (response: Response) => {
  expect(response.status).toBe(302);
  expect(response.headers.get('location')).toBe(failureUrl);
  expect(setCookies(response).some((c) => c.startsWith('session='))).toBe(false);
  expect(await sessionRows()).toEqual([]);
};

describe('GET /auth/google', () => {
  it('redirects to Google and stores state and verifier in short-lived cookies', async () => {
    const response = await appWith(fakeGoogle().google).request('/auth/google');

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('https://google.test/auth?x=1');
    expect(setCookies(response)).toEqual([
      `oauth_state=${state}; Max-Age=600; Path=/; HttpOnly; SameSite=Lax`,
      `oauth_verifier=${verifier}; Max-Age=600; Path=/; HttpOnly; SameSite=Lax`,
    ]);
  });

  it('uses __Host- prefixed, Secure cookies in production', async () => {
    const response = await appWith(fakeGoogle().google, true).request('/auth/google');

    expect(setCookies(response)[0]).toBe(
      `__Host-oauth_state=${state}; Max-Age=600; Path=/; HttpOnly; Secure; SameSite=Lax`,
    );
  });
});

describe('GET /auth/google/callback', () => {
  it('signs in a known, active user', async () => {
    const user = await savedUser();
    const { google, calls } = fakeGoogle();

    const response = await callback(appWith(google));

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(`${webAppUrl}/`);
    expect(calls).toEqual([['the-code', verifier]]);

    const cookies = setCookies(response);
    const session = cookies.find((c) => c.startsWith('session='));
    expect(session).toMatch(/^session=[\w-]{43}; Max-Age=604800; Path=\/; HttpOnly; SameSite=Lax$/);
    const token = session?.slice('session='.length, session.indexOf(';')) ?? '';
    expect(await sessionRows()).toMatchObject([
      { id: hashToken(token), userId: user.id, userAgent: 'ua/1', ip: null },
    ]);
    // The one-time flow cookies are cleared.
    expect(cookies).toContain('oauth_state=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax');
    expect(cookies).toContain('oauth_verifier=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax');

    expect(await users().findByEmail(parseEmail('mentor@example.com'))).toMatchObject({
      googleSub: 'google-sub-1',
      avatarUrl: 'https://example.com/avatar.png',
      lastLoginAt: now,
      name: 'Name From Admin', // not overwritten by Google's name
    });
  });

  it("records the client from nginx's X-Real-IP only when the proxy is trusted", async () => {
    await savedUser();

    expect((await signInFromProxy(false)).status).toBe(302);
    expect((await sessionRows()).map((row) => row.ip)).toEqual([null]);
    expect((await signInFromProxy(true)).status).toBe(302);
    expect((await sessionRows()).map((row) => row.ip)).toEqual(
      expect.arrayContaining([null, '203.0.113.7']),
    );
  });

  it('signs in with prefixed cookies in production', async () => {
    await savedUser();
    const response = await callback(
      appWith(fakeGoogle().google, true),
      `code=the-code&state=${state}`,
      flowCookies('__Host-'),
    );

    expect(response.headers.get('location')).toBe(`${webAppUrl}/`);
    expect(setCookies(response).some((c) => c.startsWith('__Host-session='))).toBe(true);
  });

  it('rejects an unknown email without creating a user', async () => {
    await expectRejected(await callback(appWith(fakeGoogle().google)));
    expect(await users().list()).toEqual([]);
  });

  it.each([
    ['an inactive user', { active: false }, identity()],
    ['a different Google account', { googleSub: 'google-sub-OTHER' }, identity()],
    ['an unverified email', {}, identity({ emailVerified: false })],
  ])('rejects %s', async (_, userState, googleIdentity) => {
    const before = await savedUser(userState);
    const { google } = fakeGoogle(() => Promise.resolve({ ok: true, identity: googleIdentity }));

    await expectRejected(await callback(appWith(google)));
    expect(await users().findById(before.id)).toEqual(before);
  });

  it.each([
    ['a state mismatch', `code=the-code&state=other`, flowCookies()],
    ['a missing state cookie', `code=the-code&state=${state}`, `oauth_verifier=${verifier}`],
    ['a missing verifier cookie', `code=the-code&state=${state}`, `oauth_state=${state}`],
    ['a missing code', `state=${state}`, flowCookies()],
    ['the user cancelling at Google', `error=access_denied&state=${state}`, flowCookies()],
    ['unprefixed cookies in production', `code=the-code&state=${state}`, flowCookies()],
  ])('rejects %s without calling Google', async (name, query, cookie) => {
    await savedUser();
    const { google, calls } = fakeGoogle();
    const secure = name.includes('production');

    await expectRejected(await callback(appWith(google, secure), query, cookie));
    expect(calls).toEqual([]);
  });

  const exchangeFailures: [string, Exchange][] = [
    ['Google rejecting the code', () => Promise.resolve({ ok: false, reason: 'code_rejected' })],
    ['an invalid ID token', () => Promise.resolve({ ok: false, reason: 'invalid_id_token' })],
    ['Google being unreachable', () => Promise.reject(new Error('fetch failed'))],
  ];

  it.each(exchangeFailures)('rejects %s and leaves the user unchanged', async (_, exchange) => {
    const before = await savedUser();

    await expectRejected(await callback(appWith(fakeGoogle(exchange).google)));
    expect(await users().findById(before.id)).toEqual(before);
  });

  it('clears the flow cookies even when rejecting', async () => {
    const response = await callback(appWith(fakeGoogle().google), 'code=x&state=other');

    expect(setCookies(response)).toEqual([
      'oauth_state=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax',
      'oauth_verifier=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax',
    ]);
  });
});

describe('when Google sign-in is not configured', () => {
  it.each(['/auth/google', '/auth/google/callback?code=x&state=y'])(
    '%s sends the browser to /login?error=unavailable',
    async (path) => {
      const response = await appWith(null).request(path);

      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe(`${webAppUrl}/login?error=unavailable`);
      expect(setCookies(response)).toEqual([]);
    },
  );
});
