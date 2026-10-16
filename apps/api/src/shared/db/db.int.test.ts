import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { resetDb, useTestDb } from '../../../test/test-db.ts';
import { createApp } from '../../app.ts';

const testDb = useTestDb();

const count = async (schema: string, table: string): Promise<number> => {
  const [row] = await testDb.handle.db.execute<{ n: number }>(
    sql`select count(*)::int as n from ${sql.identifier(schema)}.${sql.identifier(table)}`,
  );
  return row?.n ?? -1;
};

describe('test database harness', () => {
  it('connects to this file’s own database', async () => {
    const [row] = await testDb.handle.db.execute<{ db: string }>(
      sql`select current_database() as db`,
    );

    expect(row?.db).toBe(testDb.name);
    expect(testDb.name).toMatch(/^test_[0-9a-f]{32}$/);
  });

  it('starts from the migrated template', async () => {
    const extensions = await testDb.handle.db.execute(
      sql`select extname from pg_extension where extname = 'citext'`,
    );

    expect(extensions).toHaveLength(1);
    expect(await count('drizzle', '__drizzle_migrations')).toBe(1);
  });

  it('pings the real database', async () => {
    await expect(testDb.handle.ping()).resolves.toBeUndefined();
  });

  it('serves /health/ready from the real database', async () => {
    const res = await createApp({ ping: testDb.handle.ping }).request('/health/ready');

    expect(res.status).toBe(200);
  });
});

describe('resetDb', () => {
  // Runs in order: the second test proves the first test's row was cleared by `beforeEach`.
  it('empties public tables but keeps migrations', async () => {
    const { db } = testDb.handle;
    await db.execute(sql`create table if not exists scratch (id serial primary key, note citext)`);
    await db.execute(sql`insert into scratch (note) values ('Hello')`);
    expect(await count('public', 'scratch')).toBe(1);

    await resetDb(testDb.handle);

    expect(await count('public', 'scratch')).toBe(0);
    expect(await count('drizzle', '__drizzle_migrations')).toBe(1);
    await db.execute(sql`insert into scratch (note) values ('left behind')`);
  });

  it('runs before each test, so earlier rows are gone', async () => {
    expect(await count('public', 'scratch')).toBe(0);
    await testDb.handle.db.execute(sql`drop table scratch`);
  });
});
