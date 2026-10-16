import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../../../test/test-db.ts';
import { AppError } from '../../../shared/errors/app-error.ts';
import { newId } from '../../../shared/ids.ts';
import { parseEmail } from '../domain/email.ts';
import {
  createUser,
  deactivate,
  grantRole,
  revokeRole,
  signIn,
  type CreateUserInput,
  type User,
} from '../domain/user.ts';
import { UserId } from '../domain/user-id.ts';
import { createUserRepository } from './drizzle-user-repository.ts';
import { userRoles, users } from './schema.ts';

const testDb = useTestDb();
const db = () => testDb.handle.db;
const repo = () => createUserRepository(db());

const t0 = new Date('2026-01-01T09:00:00.000Z');
const t1 = new Date('2026-01-02T09:00:00.000Z');
const userId = (): UserId => UserId.parse(newId());

const newUser = (overrides: Partial<CreateUserInput> = {}): User =>
  createUser({
    id: userId(),
    email: `${newId()}@example.com`,
    name: 'A Person',
    roles: ['mentor'],
    grantedBy: null,
    now: t0,
    ...overrides,
  });

/** Saves and returns the user, so tests read top to bottom. */
const saved = async (user: User): Promise<User> => {
  await repo().save(user);
  return user;
};

const reload = async (user: User): Promise<User | null> => repo().findById(user.id);

const errorOf = async (action: Promise<unknown>): Promise<AppError> => {
  try {
    await action;
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('expected an AppError');
};

describe('save + find', () => {
  it('round-trips the whole aggregate', async () => {
    const admin = await saved(newUser({ roles: ['admin'] }));
    const user = await saved(
      newUser({ roles: ['mentor', 'program_manager'], grantedBy: admin.id }),
    );

    expect(await reload(admin)).toEqual(admin);
    expect(await reload(user)).toEqual(user);
  });

  it('finds by email regardless of case', async () => {
    const user = await saved(newUser({ email: 'a.person@example.com' }));

    expect(await repo().findByEmail(parseEmail('a.person@example.com'))).toEqual(user);
    // `parseEmail` lower-cases, so build a mixed-case lookup through the column directly.
    const rows = await db().select().from(users).where(eq(users.email, 'A.Person@Example.COM'));
    expect(rows.map((row) => row.id)).toEqual([user.id]);
  });

  it('returns null for an unknown id or email', async () => {
    expect(await repo().findById(userId())).toBeNull();
    expect(await repo().findByEmail(parseEmail('nobody@example.com'))).toBeNull();
  });
});

describe('updates', () => {
  it('persists a sign-in', async () => {
    const user = await saved(newUser());
    const next = signIn(user, { googleSub: 'google-1', avatarUrl: 'https://a/b.png', now: t1 });
    await repo().save(next);

    expect(await reload(user)).toEqual(next);
    expect(next).toMatchObject({ googleSub: 'google-1', lastLoginAt: t1, updatedAt: t1 });
  });

  it('persists deactivation', async () => {
    const admin = await saved(newUser({ roles: ['admin'] }));
    const user = await saved(newUser());
    await repo().save(deactivate(user, { by: admin.id, now: t1 }));

    expect((await reload(user))?.isActive).toBe(false);
  });

  it('adds and removes role rows, keeping existing grants unchanged', async () => {
    const admin = await saved(newUser({ roles: ['admin'] }));
    const user = await saved(newUser({ grantedBy: admin.id }));

    const granted = grantRole(user, 'program_manager', { by: admin.id, now: t1 });
    await repo().save(granted);
    expect(await reload(user)).toEqual(granted);

    const revoked = revokeRole(granted, 'mentor', { now: t1 });
    await repo().save(revoked);
    expect(await reload(user)).toEqual(revoked);
    expect((await reload(user))?.roles).toEqual([
      { role: 'program_manager', grantedBy: admin.id, grantedAt: t1 },
    ]);
  });

  it('keeps the original grantedBy / grantedAt of a grant through later saves', async () => {
    const admin = await saved(newUser({ roles: ['admin'] }));
    const user = await saved(newUser({ grantedBy: admin.id }));
    // Even if a caller hands over different grant details for a role the user already holds.
    await repo().save({ ...user, roles: [{ role: 'mentor', grantedBy: null, grantedAt: t1 }] });

    expect((await reload(user))?.roles).toEqual(user.roles);
  });

  it('is idempotent', async () => {
    const user = await saved(newUser());
    await repo().save(user);

    expect(await reload(user)).toEqual(user);
    expect(await db().select().from(userRoles)).toHaveLength(1);
  });
});

describe('email_taken', () => {
  it('rejects a second user with the same email and writes nothing', async () => {
    await saved(newUser({ email: 'taken@example.com' }));
    const duplicate = newUser({ email: 'TAKEN@example.com', roles: ['admin'] });

    expect(await errorOf(repo().save(duplicate))).toMatchObject({
      kind: 'conflict',
      code: 'email_taken',
    });
    expect(await reload(duplicate)).toBeNull();
    expect(await db().select().from(userRoles)).toHaveLength(1);
  });

  it('rejects changing an email to one another user has', async () => {
    await saved(newUser({ email: 'first@example.com' }));
    const second = await saved(newUser({ email: 'second@example.com' }));

    expect(
      await errorOf(repo().save({ ...second, email: parseEmail('first@example.com') })),
    ).toMatchObject({ code: 'email_taken' });
    expect((await reload(second))?.email).toBe('second@example.com');
  });

  it('passes other constraint violations through unchanged', async () => {
    await saved(signIn(newUser(), { googleSub: 'google-1', avatarUrl: null, now: t1 }));
    const other = signIn(newUser(), { googleSub: 'google-1', avatarUrl: null, now: t1 });

    const error = await repo()
      .save(other)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(AppError);
  });
});

describe('list', () => {
  it('returns every user ordered by name, each with their own roles', async () => {
    const carol = await saved(newUser({ name: 'Carol', roles: ['admin'] }));
    const alice = await saved(newUser({ name: 'Alice', roles: ['mentor', 'program_manager'] }));
    const bob = await saved(newUser({ name: 'Bob' }));

    expect(await repo().list()).toEqual([alice, bob, carol]);
  });

  it('loads any number of users with 2 queries', async () => {
    await Promise.all(['A', 'B', 'C', 'D'].map((name) => saved(newUser({ name }))));
    const queries: string[] = [];
    const pool = new Pool({ connectionString: testDb.url, max: 1 });
    try {
      const logged = drizzle({
        client: pool,
        casing: 'snake_case',
        logger: { logQuery: (query) => queries.push(query) },
      });

      expect(await createUserRepository(logged).list()).toHaveLength(4);
    } finally {
      await pool.end();
    }
    expect(queries).toHaveLength(2);
  });

  it('returns an empty list', async () => {
    expect(await repo().list()).toEqual([]);
  });
});

describe('countActiveAdmins', () => {
  it('counts only users who are active and admins', async () => {
    const admin = await saved(newUser({ roles: ['admin', 'mentor'] }));
    await saved(newUser({ roles: ['admin'] }));
    await saved(deactivate(newUser({ roles: ['admin'] }), { by: admin.id, now: t1 }));
    await saved(newUser({ roles: ['mentor', 'program_manager'] }));

    expect(await repo().countActiveAdmins()).toBe(2);
  });

  it('is 0 with no users', async () => {
    expect(await repo().countActiveAdmins()).toBe(0);
  });
});

describe('inside a transaction', () => {
  it('sees its own writes, and a rollback leaves nothing behind', async () => {
    const user = newUser({ roles: ['admin'] });
    const rollback = new Error('rollback');

    let seen: readonly [User | null, number] | undefined;

    const outcome = await db()
      .transaction(async (tx) => {
        const txRepo = createUserRepository(tx);
        await txRepo.save(user);
        seen = [await txRepo.findById(user.id), await txRepo.countActiveAdmins()];
        throw rollback;
      })
      .catch((caught: unknown) => caught);

    expect(outcome).toBe(rollback);
    expect(seen).toEqual([user, 1]);
    expect(await reload(user)).toBeNull();
    expect(await db().select().from(userRoles)).toEqual([]);
  });
});
