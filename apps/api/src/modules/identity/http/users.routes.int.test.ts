import { AdminUser, type Role, ProblemDetails } from '@feedback-portal/contracts';
import { setTimeout as sleep } from 'node:timers/promises';
import { Client } from 'pg';
import { describe, expect, it } from 'vitest';
import { realApp } from '../../../../test/app-deps.ts';
import { useTestDb } from '../../../../test/test-db.ts';
import type { GoogleAuth } from '../application/google-auth.ts';
import { parseEmail } from '../domain/email.ts';
import { newUserId } from '../domain/user-id.ts';
import { userAdminLock } from '../infrastructure/drizzle-user-admin.ts';
import { sessions as sessionsTable } from '../infrastructure/schema.ts';

const testDb = useTestDb();
const db = () => testDb.handle.db;

type Setup = ReturnType<typeof realApp>;

/** The full app, plus an admin who is signed in. */
const asAdmin = async (options: Parameters<typeof realApp>[1] = {}) => {
  const setup = realApp(db(), options);
  const admin = await setup.signedInUser({ name: 'The Admin', roles: ['admin'] });
  return { ...setup, admin };
};

const call = (
  { app, webAppUrl }: Setup,
  cookie: string,
  method: string,
  path: string,
  body?: unknown,
) =>
  app.request(path, {
    method,
    headers: {
      cookie,
      origin: webAppUrl,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const problemOf = async (response: Response, status: number) => {
  expect(response.status).toBe(status);
  expect(response.headers.get('content-type')).toBe('application/problem+json');
  return ProblemDetails.parse(await response.json());
};

const adminUserOf = async (response: Response, status = 200) => {
  expect(response.status).toBe(status);
  return AdminUser.parse(await response.json());
};

const sessionUserIds = async () =>
  (await db().select({ userId: sessionsTable.userId }).from(sessionsTable)).map((r) => r.userId);

const newUser = { email: ' New.Mentor@Example.COM ', name: ' New Mentor ', roles: ['mentor'] };

describe('/users access', () => {
  const routes: [string, string, unknown?][] = [
    ['GET', '/users'],
    ['POST', '/users', newUser],
    ['PUT', `/users/${newUserId()}/roles`, { roles: ['mentor'] }],
    ['POST', `/users/${newUserId()}/deactivate`],
    ['POST', `/users/${newUserId()}/reactivate`],
  ];

  it.each(routes)('%s %s: 401 when signed out', async (method, path, body) => {
    const setup = realApp(db());

    const problem = await problemOf(await call(setup, '', method, path, body), 401);
    expect(problem.code).toBe('unauthenticated');
  });

  it.each(routes)('%s %s: 403 for mentors and programme managers', async (method, path, body) => {
    const setup = realApp(db());
    const { cookie } = await setup.signedInUser({ roles: ['mentor', 'program_manager'] });

    const problem = await problemOf(await call(setup, cookie, method, path, body), 403);
    expect(problem).toMatchObject({ code: 'forbidden', detail: 'Requires one of: admin' });
  });
});

describe('GET /users', () => {
  it('lists every user by name, inactive ones included', async () => {
    const setup = await asAdmin();
    const inactive = await setup.signedInUser({ name: 'Alice', active: false });
    const mentor = await setup.signedInUser({ name: 'Bob', roles: ['program_manager', 'mentor'] });

    const response = await call(setup, setup.admin.cookie, 'GET', '/users');

    expect(response.status).toBe(200);
    const users = AdminUser.array().parse(await response.json());
    expect(users.map(({ id, isActive, roles }) => ({ id, isActive, roles }))).toEqual([
      { id: inactive.user.id, isActive: false, roles: ['mentor'] },
      { id: mentor.user.id, isActive: true, roles: ['mentor', 'program_manager'] },
      { id: setup.admin.user.id, isActive: true, roles: ['admin'] },
    ]);
    expect(users[2]).toEqual({
      id: setup.admin.user.id,
      email: setup.admin.user.email,
      name: 'The Admin',
      avatarUrl: null,
      isActive: true,
      roles: ['admin'],
      lastLoginAt: null,
      createdAt: setup.admin.user.createdAt.toISOString(),
    });
  });
});

describe('POST /users', () => {
  it('adds a user, normalised, granted by the admin', async () => {
    const setup = await asAdmin();

    const response = await call(setup, setup.admin.cookie, 'POST', '/users', newUser);

    const body = await adminUserOf(response, 201);
    expect(response.headers.get('location')).toBe(`/users/${body.id}`);
    expect(body).toMatchObject({
      email: 'new.mentor@example.com',
      name: 'New Mentor',
      isActive: true,
      roles: ['mentor'],
      lastLoginAt: null,
    });
    const stored = await setup.users.findByEmail(parseEmail('new.mentor@example.com'));
    expect(stored?.roles).toEqual([
      { role: 'mentor', grantedBy: setup.admin.user.id, grantedAt: expect.any(Date) },
    ]);
  });

  it('lets the added user sign in with Google', async () => {
    const google: GoogleAuth = {
      start: () => ({ url: new URL('https://google.test/'), state: 's', codeVerifier: 'v' }),
      exchange: () =>
        Promise.resolve({
          ok: true,
          identity: {
            sub: 'google-sub-new',
            email: 'New.Mentor@example.com',
            emailVerified: true,
            name: null,
            picture: null,
          },
        }),
    };
    const setup = await asAdmin({ googleAuth: google });
    await call(setup, setup.admin.cookie, 'POST', '/users', newUser);

    const response = await setup.app.request('/auth/google/callback?code=c&state=s', {
      headers: { cookie: 'oauth_state=s; oauth_verifier=v' },
    });

    expect(response.headers.get('location')).toBe(`${setup.webAppUrl}/`);
    const stored = await setup.users.findByEmail(parseEmail('new.mentor@example.com'));
    expect(stored?.googleSub).toBe('google-sub-new');

    // The session works, with the name and roles the admin gave.
    const session = response.headers.getSetCookie().find((c) => c.startsWith('session='));
    const me = await call(setup, session?.split(';')[0] ?? '', 'GET', '/me');
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({
      email: 'new.mentor@example.com',
      name: 'New Mentor',
      roles: ['mentor'],
    });
  });

  it('rejects an email that is already taken, in any case', async () => {
    const setup = await asAdmin();
    await call(setup, setup.admin.cookie, 'POST', '/users', newUser);

    const response = await call(setup, setup.admin.cookie, 'POST', '/users', {
      ...newUser,
      email: 'NEW.MENTOR@example.com',
    });

    expect((await problemOf(response, 409)).code).toBe('email_taken');
    expect(await setup.users.list()).toHaveLength(2);
  });

  it('reports every invalid field', async () => {
    const setup = await asAdmin();

    const response = await call(setup, setup.admin.cookie, 'POST', '/users', {
      email: 'nope',
      name: '',
      roles: ['owner'],
    });

    const problem = await problemOf(response, 400);
    expect(problem.code).toBe('validation_failed');
    expect(problem.errors?.map((issue) => issue.path)).toEqual(['email', 'name', 'roles.0']);
  });
});

const putRoles = (setup: Setup, cookie: string, id: string, roles: unknown) =>
  call(setup, cookie, 'PUT', `/users/${id}/roles`, { roles });

describe('PUT /users/:id/roles', () => {
  it('replaces the set, and kept grants keep their original date', async () => {
    const setup = await asAdmin();
    const { user } = await setup.signedInUser({ roles: ['mentor', 'program_manager'] });
    setup.travel(60_000);

    const body = await adminUserOf(
      await putRoles(setup, setup.admin.cookie, user.id, ['program_manager', 'admin']),
    );

    expect(body.roles).toEqual(['admin', 'program_manager']);
    const stored = await setup.users.findById(user.id);
    expect(stored?.roles).toEqual([
      user.roles[1],
      { role: 'admin', grantedBy: setup.admin.user.id, grantedAt: expect.any(Date) },
    ]);
  });

  it('writes nothing when the set is unchanged', async () => {
    const setup = await asAdmin();
    const { user } = await setup.signedInUser({ roles: ['mentor'] });
    setup.travel(60_000);

    await adminUserOf(await putRoles(setup, setup.admin.cookie, user.id, ['mentor']));

    expect(await setup.users.findById(user.id)).toEqual(user);
  });

  it.each([
    ['an empty list', []],
    ['an unknown role', ['owner']],
    ['a missing list', undefined],
  ])('answers 400 for %s', async (_, roles) => {
    const setup = await asAdmin();
    const { user } = await setup.signedInUser();

    const problem = await problemOf(await putRoles(setup, setup.admin.cookie, user.id, roles), 400);
    expect(problem.code).toBe('validation_failed');
  });

  it('answers 404 for an unknown user and 400 for a malformed id', async () => {
    const setup = await asAdmin();

    const unknown = await putRoles(setup, setup.admin.cookie, newUserId(), ['mentor']);
    expect((await problemOf(unknown, 404)).code).toBe('not_found');
    const malformed = await putRoles(setup, setup.admin.cookie, 'not-an-id', ['mentor']);
    expect((await problemOf(malformed, 400)).errors?.map((issue) => issue.path)).toEqual(['id']);
  });

  it("refuses to remove the admin's own admin role", async () => {
    const setup = await asAdmin();
    await setup.signedInUser({ roles: ['admin'] }); // another admin exists: still refused

    const response = await putRoles(setup, setup.admin.cookie, setup.admin.user.id, ['mentor']);

    expect((await problemOf(response, 409)).code).toBe('cannot_remove_own_admin');
    expect(await setup.users.findById(setup.admin.user.id)).toEqual(setup.admin.user);
  });

  it("removes another admin's admin role", async () => {
    const setup = await asAdmin();
    const other = await setup.signedInUser({ roles: ['admin', 'mentor'] });

    const body = await adminUserOf(
      await putRoles(setup, setup.admin.cookie, other.user.id, ['mentor']),
    );
    expect(body.roles).toEqual(['mentor']);
  });
});

describe('POST /users/:id/deactivate and /reactivate', () => {
  it('deactivates a user and signs them out everywhere', async () => {
    const setup = await asAdmin();
    const target = await setup.signedInUser();
    await setup.sessions.create(target.user.id, { userAgent: null, ip: null });

    const body = await adminUserOf(
      await call(setup, setup.admin.cookie, 'POST', `/users/${target.user.id}/deactivate`),
    );

    expect(body.isActive).toBe(false);
    expect(await sessionUserIds()).toEqual([setup.admin.user.id]);
    expect((await setup.app.request('/me', { headers: { cookie: target.cookie } })).status).toBe(
      401,
    );
  });

  it('is idempotent', async () => {
    const setup = await asAdmin();
    const target = await setup.signedInUser({ active: false });

    const body = await adminUserOf(
      await call(setup, setup.admin.cookie, 'POST', `/users/${target.user.id}/deactivate`),
    );
    expect(body.isActive).toBe(false);
    expect(await setup.users.findById(target.user.id)).toEqual(target.user);
  });

  it('refuses to deactivate yourself', async () => {
    const setup = await asAdmin();

    const response = await call(
      setup,
      setup.admin.cookie,
      'POST',
      `/users/${setup.admin.user.id}/deactivate`,
    );

    expect((await problemOf(response, 409)).code).toBe('cannot_deactivate_self');
    expect(await sessionUserIds()).toEqual([setup.admin.user.id]);
  });

  it('reactivates a user, who then signs in again', async () => {
    const setup = await asAdmin();
    const target = await setup.signedInUser({ active: false });

    const body = await adminUserOf(
      await call(setup, setup.admin.cookie, 'POST', `/users/${target.user.id}/reactivate`),
    );

    expect(body.isActive).toBe(true);
    expect((await setup.users.findById(target.user.id))?.isActive).toBe(true);
  });

  it('answers 404 for an unknown user', async () => {
    const setup = await asAdmin();

    const response = await call(
      setup,
      setup.admin.cookie,
      'POST',
      `/users/${newUserId()}/deactivate`,
    );
    expect((await problemOf(response, 404)).code).toBe('not_found');
  });
});

/**
 * Resolves once `count` transactions are waiting for the user-admin lock. This is what proves the
 * two changes were in flight together: on their own they rarely overlap.
 */
const waitForLockWaiters = async (
  holder: Client,
  count: number,
  triesLeft = 100,
): Promise<void> => {
  const { rows } = await holder.query<{ n: number }>(
    "select count(*)::int as n from pg_locks where locktype = 'advisory' and not granted",
  );
  if (rows[0]?.n === count) return;
  if (triesLeft === 0) throw new Error(`expected ${count} lock waiters, saw ${rows[0]?.n}`);
  await sleep(20);
  return waitForLockWaiters(holder, count, triesLeft - 1);
};

/**
 * Two admins act on each other while another connection holds the user-admin lock, so both
 * changes are in flight together. Returns the outcome codes (sorted) and the active admin count.
 */
const raceBetweenAdmins = async (
  action: (setup: Setup, actorCookie: string, targetId: string) => Response | Promise<Response>,
) => {
  const setup = await asAdmin();
  const other = await setup.signedInUser({ name: 'Other Admin', roles: ['admin'] });

  const holder = new Client({ connectionString: testDb.url });
  await holder.connect();
  try {
    await holder.query('begin');
    await holder.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [userAdminLock]);
    const responses = Promise.all([
      action(setup, setup.admin.cookie, other.user.id),
      action(setup, other.cookie, setup.admin.user.id),
    ]);
    await waitForLockWaiters(holder, 2);
    await holder.query('commit');

    const outcomes = await Promise.all(
      (await responses).map(async (response) =>
        response.ok ? response.status : ProblemDetails.parse(await response.json()).code,
      ),
    );
    return {
      outcomes: outcomes.map(String).toSorted(),
      activeAdmins: await setup.users.countActiveAdmins(),
    };
  } finally {
    await holder.end();
  }
};

describe('at least one active admin remains', () => {
  it('two admins deactivating each other at once: one wins, one gets last_admin', async () => {
    const result = await raceBetweenAdmins((setup, cookie, id) =>
      call(setup, cookie, 'POST', `/users/${id}/deactivate`),
    );

    expect(result).toEqual({ outcomes: ['200', 'last_admin'], activeAdmins: 1 });
  });

  it('two admins removing admin from each other at once: one wins, one gets last_admin', async () => {
    const roles: Role[] = ['mentor'];
    const result = await raceBetweenAdmins((setup, cookie, id) =>
      putRoles(setup, cookie, id, roles),
    );

    expect(result).toEqual({ outcomes: ['200', 'last_admin'], activeAdmins: 1 });
  });
});
