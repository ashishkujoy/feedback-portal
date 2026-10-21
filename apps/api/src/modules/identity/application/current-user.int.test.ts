import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../../../test/test-db.ts';
import { createUser, deactivate, type User } from '../domain/user.ts';
import { newUserId } from '../domain/user-id.ts';
import { createSessionRepository } from '../infrastructure/drizzle-session-repository.ts';
import { createUserRepository } from '../infrastructure/drizzle-user-repository.ts';
import { sessions as sessionsTable } from '../infrastructure/schema.ts';
import { resolveCurrentUser } from './current-user.ts';
import { createSessions } from './sessions.ts';

const testDb = useTestDb();
const db = () => testDb.handle.db;

const day = 24 * 60 * 60 * 1000;
const t0 = new Date('2026-01-01T00:00:00.000Z');

/** Real repositories; the test moves the clock. */
const setup = () => {
  let current = t0;
  const users = createUserRepository(db());
  const sessions = createSessions({
    sessions: createSessionRepository(db()),
    now: () => current,
  });
  return {
    users,
    sessions,
    travel: (ms: number) => {
      current = new Date(t0.getTime() + ms);
    },
  };
};

const savedUser = async (users: ReturnType<typeof setup>['users'], active = true) => {
  let user: User = createUser({
    id: newUserId(),
    email: `${newUserId()}@example.com`,
    name: 'Someone',
    roles: ['mentor'],
    grantedBy: null,
    now: t0,
  });
  if (!active) user = deactivate(user, { by: newUserId(), now: t0 });
  await users.save(user);
  return user;
};

const metadata = { userAgent: null, ip: null };
const rows = () => db().select().from(sessionsTable);

describe('resolveCurrentUser', () => {
  it('returns the active user with their roles, not renewed while fresh', async () => {
    const { users, sessions } = setup();
    const user = await savedUser(users);
    const { token, session } = await sessions.create(user.id, metadata);

    expect(await resolveCurrentUser({ users, sessions }, token)).toEqual({
      ok: true,
      user,
      session,
      renewed: false,
    });
  });

  it('reports a renewal once past the halfway point', async () => {
    const { users, sessions, travel } = setup();
    const user = await savedUser(users);
    const { token } = await sessions.create(user.id, metadata);
    travel(4 * day);

    const result = await resolveCurrentUser({ users, sessions }, token);

    expect(result).toMatchObject({ ok: true, renewed: true, session: { userId: user.id } });
  });

  it('rejects an unknown, malformed or expired token', async () => {
    const { users, sessions, travel } = setup();
    const user = await savedUser(users);
    const { token } = await sessions.create(user.id, metadata);
    const deps = { users, sessions };

    expect(await resolveCurrentUser(deps, 'x'.repeat(43))).toEqual({
      ok: false,
      reason: 'no_session',
    });
    expect(await resolveCurrentUser(deps, 'not a token')).toEqual({
      ok: false,
      reason: 'no_session',
    });
    travel(8 * day);
    expect(await resolveCurrentUser(deps, token)).toEqual({ ok: false, reason: 'no_session' });
  });

  it('rejects an inactive user and revokes only the session presented', async () => {
    const { users, sessions } = setup();
    const user = await savedUser(users, false);
    const { token } = await sessions.create(user.id, metadata);
    const other = await sessions.create(user.id, metadata);

    expect(await resolveCurrentUser({ users, sessions }, token)).toEqual({
      ok: false,
      reason: 'inactive',
      userId: user.id,
    });
    expect((await rows()).map((r) => r.id)).toEqual([other.session.id]);
  });

  it('rejects a session whose user cannot be loaded', async () => {
    const { users, sessions } = setup();
    const user = await savedUser(users);
    const { token } = await sessions.create(user.id, metadata);
    const missingUsers = { ...users, findById: () => Promise.resolve(null) };

    expect(await resolveCurrentUser({ users: missingUsers, sessions }, token)).toEqual({
      ok: false,
      reason: 'unknown_user',
    });
  });
});
