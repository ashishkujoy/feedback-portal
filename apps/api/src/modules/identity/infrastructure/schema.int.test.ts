import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../../../test/test-db.ts';
import { pgErrorCodes, pgErrorOf } from '../../../shared/db/pg-error.ts';
import { newId } from '../../../shared/ids.ts';
import { sessions, userRoles, users } from './schema.ts';

const testDb = useTestDb();
const db = () => testDb.handle.db;

const uuidV7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Postgres SQLSTATE of a failed query. */
const sqlState = async (query: Promise<unknown>): Promise<string | undefined> => {
  try {
    await query;
  } catch (error) {
    const info = pgErrorOf(error);
    if (info) return info.code;
    throw error;
  }
  return undefined;
};

const inOneHour = () => new Date(Date.now() + 3_600_000);

const { uniqueViolation, foreignKeyViolation, invalidTextRepresentation } = pgErrorCodes;

const insertUser = async (values: { email: string; googleSub?: string | null; id?: string }) => {
  const [user] = await db()
    .insert(users)
    .values({ name: 'Test User', ...values })
    .returning();
  if (!user) throw new Error('insert returned no row');
  return user;
};

describe('users', () => {
  it('fills id (uuid v7), is_active and timestamps from defaults', async () => {
    const user = await insertUser({ email: 'mentor@example.com' });

    expect(user.id).toMatch(uuidV7);
    expect(user.isActive).toBe(true);
    expect(user.googleSub).toBeNull();
    expect(user.createdAt).toBeInstanceOf(Date);
    expect(user.updatedAt).toBeInstanceOf(Date);
  });

  it('keeps an app-supplied id', async () => {
    const id = newId();

    expect((await insertUser({ email: 'pm@example.com', id })).id).toBe(id);
  });

  it('rejects an email that differs only in case', async () => {
    await insertUser({ email: 'a.person@example.com' });

    expect(await sqlState(insertUser({ email: 'A.Person@Example.COM' }))).toBe(uniqueViolation);
  });

  it('finds a user by email regardless of case', async () => {
    await insertUser({ email: 'case@example.com' });

    const found = await db().select().from(users).where(eq(users.email, 'CASE@example.com'));
    expect(found).toHaveLength(1);
  });

  it('rejects a duplicate google_sub but allows many users without one', async () => {
    await insertUser({ email: 'one@example.com', googleSub: 'google-123' });
    await insertUser({ email: 'two@example.com' });
    await insertUser({ email: 'three@example.com' });

    expect(await sqlState(insertUser({ email: 'four@example.com', googleSub: 'google-123' }))).toBe(
      uniqueViolation,
    );
  });

  it('sets updated_at on update', async () => {
    const user = await insertUser({ email: 'update@example.com' });
    // Backdate it, so the check doesn't depend on the DB and app clocks agreeing.
    await db().execute(sql`update users set updated_at = '2000-01-01' where id = ${user.id}`);

    const before = Date.now();
    const [updated] = await db()
      .update(users)
      .set({ name: 'Renamed' })
      .where(eq(users.id, user.id))
      .returning();

    expect(updated?.updatedAt.getTime()).toBeGreaterThanOrEqual(before);
  });
});

describe('user_roles', () => {
  it('allows several roles per user and a system grant (granted_by null)', async () => {
    const admin = await insertUser({ email: 'admin@example.com' });
    const user = await insertUser({ email: 'both@example.com' });

    await db().insert(userRoles).values({ userId: admin.id, role: 'admin', grantedBy: null });
    await db()
      .insert(userRoles)
      .values([
        { userId: user.id, role: 'mentor', grantedBy: admin.id },
        { userId: user.id, role: 'program_manager', grantedBy: admin.id },
      ]);

    const rows = await db().select().from(userRoles).where(eq(userRoles.userId, user.id));
    expect(rows.map((r) => r.role).toSorted()).toEqual(['mentor', 'program_manager']);
  });

  it('rejects granting the same role twice', async () => {
    const user = await insertUser({ email: 'twice@example.com' });
    await db().insert(userRoles).values({ userId: user.id, role: 'mentor' });

    expect(await sqlState(db().insert(userRoles).values({ userId: user.id, role: 'mentor' }))).toBe(
      uniqueViolation,
    );
  });

  it('rejects a role outside the enum', async () => {
    const user = await insertUser({ email: 'enum@example.com' });

    expect(
      await sqlState(
        db().execute(sql`insert into user_roles (user_id, role) values (${user.id}, 'superuser')`),
      ),
    ).toBe(invalidTextRepresentation);
  });

  it('rejects a grant by an unknown user', async () => {
    const user = await insertUser({ email: 'grantee@example.com' });

    expect(
      await sqlState(
        db().insert(userRoles).values({ userId: user.id, role: 'mentor', grantedBy: newId() }),
      ),
    ).toBe(foreignKeyViolation);
  });
});

describe('sessions', () => {
  it('rejects a session for an unknown user', async () => {
    expect(
      await sqlState(
        db().insert(sessions).values({ id: 'hash-1', userId: newId(), expiresAt: inOneHour() }),
      ),
    ).toBe(foreignKeyViolation);
  });

  it('removes roles and sessions with their user', async () => {
    const user = await insertUser({ email: 'cascade@example.com' });
    await db().insert(userRoles).values({ userId: user.id, role: 'mentor' });
    await db().insert(sessions).values({ id: 'hash-2', userId: user.id, expiresAt: inOneHour() });

    await db().delete(users).where(eq(users.id, user.id));

    expect(await db().select().from(userRoles)).toEqual([]);
    expect(await db().select().from(sessions)).toEqual([]);
  });
});
