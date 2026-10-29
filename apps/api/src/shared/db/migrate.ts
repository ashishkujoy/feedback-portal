import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Database } from './client.ts';

/** Generated SQL migrations, committed under `apps/api/drizzle`. */
export const migrationsFolder = fileURLToPath(new URL('../../../drizzle', import.meta.url));

/** Held while migrating, so two deploys starting at once apply each migration only once. */
export const migrationLock = 'feedback-portal:migrate';

/**
 * Applies pending migrations in order; already-applied ones are skipped. Takes one connection
 * (so a pool of one is enough), holds the migration lock on it, and migrates over it: a second
 * run waits for the first, then finds nothing to apply.
 */
export const runMigrations = async (db: Database): Promise<void> => {
  const client = await db.$client.connect();
  try {
    const session = drizzle({ client, casing: 'snake_case' });
    const key = sql`hashtextextended(${migrationLock}, 0)`;
    await session.execute(sql`select pg_advisory_lock(${key})`);
    try {
      await migrate(session, { migrationsFolder });
    } finally {
      await session.execute(sql`select pg_advisory_unlock(${key})`);
    }
  } finally {
    client.release();
  }
};
