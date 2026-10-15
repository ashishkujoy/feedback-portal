import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import type { Database } from './client.ts';

/** Generated SQL migrations, committed under `apps/api/drizzle`. */
export const migrationsFolder = fileURLToPath(new URL('../../../drizzle', import.meta.url));

/** Applies pending migrations in order; already-applied ones are skipped. */
export const runMigrations = (db: Database): Promise<void> => migrate(db, { migrationsFolder });
