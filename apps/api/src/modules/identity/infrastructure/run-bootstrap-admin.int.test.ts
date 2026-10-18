import { setTimeout as sleep } from 'node:timers/promises';
import { Client } from 'pg';
import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../../../test/test-db.ts';
import { parseEmail } from '../domain/email.ts';
import { createUser, deactivate, type User } from '../domain/user.ts';
import { newUserId } from '../domain/user-id.ts';
import { createUserRepository } from './drizzle-user-repository.ts';
import type { BootstrapAdminInput } from '../application/bootstrap-admin.ts';
import { bootstrapAdminLock, runBootstrapAdmin } from './run-bootstrap-admin.ts';

const testDb = useTestDb();
const db = () => testDb.handle.db;
const repo = () => createUserRepository(db());

const t0 = new Date('2026-01-01T09:00:00.000Z');
const t1 = new Date('2026-01-02T09:00:00.000Z');
const input: BootstrapAdminInput = { email: 'admin@example.com', name: null };

const seed = (overrides: Partial<BootstrapAdminInput> = {}, now = t1) =>
  runBootstrapAdmin(db(), { ...input, ...overrides }, now);

const saved = async (user: User): Promise<User> => {
  await repo().save(user);
  return user;
};

const newUser = (email: string, roles: User['roles'][number]['role'][]): User =>
  createUser({ id: newUserId(), email, name: 'Someone', roles, grantedBy: null, now: t0 });

const findAdmin = () => repo().findByEmail(parseEmail(input.email));

describe('runBootstrapAdmin', () => {
  it('creates an active admin with a system grant when there is none', async () => {
    const result = await seed();
    const user = await findAdmin();

    expect(result).toEqual({ outcome: 'created', userId: user?.id });
    expect(user).toMatchObject({
      email: 'admin@example.com',
      name: 'admin',
      isActive: true,
      roles: [{ role: 'admin', grantedBy: null, grantedAt: t1 }],
      createdAt: t1,
    });
  });

  it('is idempotent: a second run finds the admin and writes nothing', async () => {
    await seed();
    const before = await repo().list();

    expect(await seed({}, new Date('2026-02-01T00:00:00.000Z'))).toEqual({
      outcome: 'admin_exists',
    });
    expect(await repo().list()).toEqual(before);
  });

  it('normalises the email and uses the configured name', async () => {
    await seed({ email: '  Admin@Example.COM ', name: 'First Admin' });

    expect(await findAdmin()).toMatchObject({ email: 'admin@example.com', name: 'First Admin' });
  });

  it('does nothing when another active admin exists', async () => {
    const other = await saved(newUser('other@example.com', ['admin']));

    expect(await seed()).toEqual({ outcome: 'admin_exists' });
    expect(await findAdmin()).toBeNull();
    expect(await repo().list()).toEqual([other]);
  });

  it('leaves a deactivated bootstrap user alone while another admin is active', async () => {
    const other = await saved(newUser('other@example.com', ['admin']));
    const deactivated = await saved(
      deactivate(newUser(input.email, ['admin']), { by: other.id, now: t0 }),
    );

    expect(await seed()).toEqual({ outcome: 'admin_exists' });
    expect(await findAdmin()).toEqual(deactivated);
  });

  it('restores an existing user to active admin when no active admin is left', async () => {
    const pm = newUser(input.email, ['program_manager']);
    const inactivePm = await saved(deactivate(pm, { by: newUserId(), now: t0 }));
    const inactiveAdmin = newUser('old-admin@example.com', ['admin']);
    await saved(deactivate(inactiveAdmin, { by: newUserId(), now: t0 }));

    expect(await seed()).toEqual({ outcome: 'restored', userId: inactivePm.id });
    expect(await findAdmin()).toEqual({
      ...inactivePm,
      isActive: true,
      roles: [...inactivePm.roles, { role: 'admin', grantedBy: null, grantedAt: t1 }],
      updatedAt: t1,
    });
    expect(await repo().countActiveAdmins()).toBe(1);
  });

  it('rejects an invalid email without writing anything', async () => {
    await expect(seed({ email: 'not-an-email' })).rejects.toMatchObject({
      code: 'validation_failed',
    });
    expect(await repo().list()).toEqual([]);
  });

  it('serialises concurrent runs: they wait for the lock, then exactly one creates', async () => {
    // Hold the seed's lock from another connection, so both runs are in flight at the same time.
    const holder = new Client({ connectionString: testDb.url });
    await holder.connect();
    try {
      await holder.query('begin');
      await holder.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [
        bootstrapAdminLock,
      ]);
      const runs = Promise.all([seed(), seed()]);
      await sleep(300);
      const { rows } = await holder.query<{ n: number }>('select count(*)::int as n from users');
      expect(rows).toEqual([{ n: 0 }]);
      await holder.query('commit');

      const results = await runs;
      expect(results.map((result) => result.outcome).toSorted()).toEqual([
        'admin_exists',
        'created',
      ]);
    } finally {
      await holder.end();
    }
    expect(await repo().list()).toHaveLength(1);
  });
});
