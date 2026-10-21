import { MeResponse, ProblemDetails } from '@feedback-portal/contracts';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { realApp } from '../../../../test/app-deps.ts';
import { useTestDb } from '../../../../test/test-db.ts';
import { signIn } from '../domain/user.ts';
import { sessions as sessionsTable } from '../infrastructure/schema.ts';

const testDb = useTestDb();
const db = () => testDb.handle.db;

const day = 24 * 60 * 60 * 1000;
const webAppUrl = 'http://web.test';
const clearedCookie = 'session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax';

const setup = (secureCookies = false) => realApp(db(), { secureCookies });

const me = (app: ReturnType<typeof setup>['app'], cookie?: string) =>
  app.request('/me', cookie === undefined ? {} : { headers: { cookie } });

const logout = (app: ReturnType<typeof setup>['app'], headers: Record<string, string> = {}) =>
  app.request('/auth/logout', { method: 'POST', headers: { origin: webAppUrl, ...headers } });

const sessionIds = async () =>
  (await db().select({ id: sessionsTable.id }).from(sessionsTable)).map(({ id }) => id);

const expectUnauthenticated = async (response: Response) => {
  expect(response.status).toBe(401);
  expect(response.headers.get('content-type')).toBe('application/problem+json');
  expect(ProblemDetails.parse(await response.json())).toMatchObject({
    code: 'unauthenticated',
    detail: 'Authentication required',
  });
};

describe('GET /me', () => {
  it('returns the signed-in user, never cached, without re-sending a fresh cookie', async () => {
    const { app, users, signedInUser } = setup();
    const { user, cookie } = await signedInUser({ roles: ['mentor', 'admin'] });
    await users.save(
      signIn(user, { googleSub: 'sub-1', avatarUrl: 'https://example.com/a.png', now: new Date() }),
    );

    const response = await me(app, cookie);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(MeResponse.parse(await response.json())).toEqual({
      id: user.id,
      email: user.email,
      name: 'Signed In',
      avatarUrl: 'https://example.com/a.png',
      roles: ['admin', 'mentor'], // in the order of `roles`, not of the grants
    });
  });

  it('answers 401 without a cookie, and sets none', async () => {
    const response = await me(setup().app);

    await expectUnauthenticated(response);
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it.each([
    ['a malformed token', 'session=not-a-token'],
    ['an unknown token', `session=${'x'.repeat(43)}`],
  ])('answers 401 for %s, and clears the cookie', async (_, cookie) => {
    const response = await me(setup().app, cookie);

    await expectUnauthenticated(response);
    expect(response.headers.getSetCookie()).toEqual([clearedCookie]);
  });

  it('re-sends the cookie with the new expiry once renewal is due', async () => {
    const { app, signedInUser, travel } = setup();
    const { token, session, cookie } = await signedInUser();
    travel(4 * day);

    const response = await me(app, cookie);

    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()).toEqual([
      `session=${token}; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax`,
    ]);
    const [row] = await db().select().from(sessionsTable).where(eq(sessionsTable.id, session.id));
    expect(row?.expiresAt.getTime()).toBe(session.createdAt.getTime() + 11 * day);
  });

  it('answers 401 for an expired session and deletes it', async () => {
    const { app, signedInUser, travel } = setup();
    const { cookie } = await signedInUser();
    travel(8 * day);

    const response = await me(app, cookie);

    await expectUnauthenticated(response);
    expect(response.headers.getSetCookie()).toEqual([clearedCookie]);
    expect(await sessionIds()).toEqual([]);
  });

  it('answers 401 for an inactive user and deletes that session', async () => {
    const { app, signedInUser } = setup();
    const { cookie } = await signedInUser({ active: false });

    await expectUnauthenticated(await me(app, cookie));
    expect(await sessionIds()).toEqual([]);
  });

  it('accepts only the __Host- cookie in production', async () => {
    const { app, signedInUser } = setup(true);
    const { token, cookie } = await signedInUser();

    expect((await me(app, cookie)).status).toBe(200);
    await expectUnauthenticated(await me(app, `session=${token}`));
  });
});

describe('POST /auth/logout', () => {
  it('ends only that session and clears the cookie', async () => {
    const { app, signedInUser, sessions } = setup();
    const { user, cookie } = await signedInUser();
    const other = await sessions.create(user.id, { userAgent: null, ip: null });

    const response = await logout(app, { cookie });

    expect(response.status).toBe(204);
    expect(response.headers.getSetCookie()).toEqual([clearedCookie]);
    expect(await sessionIds()).toEqual([other.session.id]);
    await expectUnauthenticated(await me(app, cookie));
  });

  it.each([
    ['no cookie', {}],
    ['an unknown token', { cookie: `session=${'x'.repeat(43)}` }],
  ])('answers 204 with %s', async (_, headers) => {
    const response = await logout(setup().app, headers);

    expect(response.status).toBe(204);
    expect(response.headers.getSetCookie()).toEqual([clearedCookie]);
  });

  it('rejects a request from another origin with 403, and keeps the session', async () => {
    const { app, signedInUser } = setup();
    const { session, cookie } = await signedInUser();

    const response = await logout(app, { cookie, origin: 'https://evil.example' });

    expect(response.status).toBe(403);
    expect(response.headers.get('content-type')).toBe('application/problem+json');
    const problem = ProblemDetails.parse(await response.json());
    expect(problem).toMatchObject({ code: 'forbidden', title: 'Forbidden' });
    expect(problem).not.toHaveProperty('detail');
    expect(await sessionIds()).toEqual([session.id]);
  });

  it('rejects a cross-site form post even without an Origin header', async () => {
    const { app, signedInUser } = setup();
    const { session, cookie } = await signedInUser();

    const response = await app.request('/auth/logout', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    });

    expect(response.status).toBe(403);
    expect(await sessionIds()).toEqual([session.id]);
  });
});
