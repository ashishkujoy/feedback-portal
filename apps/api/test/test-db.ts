import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, inject } from 'vitest';
import { createDb, type DbHandle } from '../src/shared/db/client.ts';
import { templateDatabase, withDatabase } from './postgres.ts';

export type TestDb = {
  /** This file's database name (`test_<uuid>`). */
  readonly name: string;
  /** Connection URL for this file's database (contains credentials; tests only). */
  readonly url: string;
  /** Connected to this file's database; available from `beforeAll` on. */
  readonly handle: DbHandle;
};

/** Empties every table in `public` (migrations live in the `drizzle` schema and are kept). */
export const resetDb = async ({ db }: DbHandle): Promise<void> => {
  const tables = await db.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  );
  if (tables.rows.length === 0) return;
  const names = tables.rows.map(({ tablename }) => sql`public.${sql.identifier(tablename)}`);
  await db.execute(sql`truncate ${sql.join(names, sql`, `)} restart identity cascade`);
};

/**
 * Gives the calling test file its own database, cloned from the migrated template, and empties
 * its tables before each test. Call once at the top level of a `*.int.test.ts` file.
 */
export const useTestDb = (): TestDb => {
  const adminUrl = inject('pgAdminUrl');
  // Generated, never user input — safe to interpolate as an identifier.
  const name = `test_${randomUUID().replaceAll('-', '')}`;
  const url = withDatabase(adminUrl, name);
  let handle: DbHandle | undefined;

  const runAdmin = async (statement: string): Promise<void> => {
    const client = new Client({ connectionString: adminUrl });
    await client.connect();
    try {
      await client.query(statement);
    } finally {
      await client.end();
    }
  };

  beforeAll(async () => {
    await runAdmin(`create database "${name}" template "${templateDatabase}" strategy file_copy`);
    handle = createDb({ url, poolMax: 2 });
  });

  beforeEach(async () => {
    if (handle) await resetDb(handle);
  });

  afterAll(async () => {
    await handle?.close();
    await runAdmin(`drop database if exists "${name}" with (force)`);
  });

  return {
    name,
    url,
    get handle() {
      if (!handle) throw new Error('useTestDb: handle is only available inside tests and hooks');
      return handle;
    },
  };
};
