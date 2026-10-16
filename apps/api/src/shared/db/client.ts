import { getLogger } from '@logtape/logtape';
import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase, type NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';
import type { DbConfig } from '../config/config.ts';
import { rootCategory } from '../logging/logging.ts';

// Repositories use the core query builder, not the relational API, so no schema is attached.
export type Database = NodePgDatabase;

/** The pool or a transaction: what repositories take, so a use case can compose them atomically. */
export type DbExecutor = PgDatabase<NodePgQueryResultHKT>;

export type DbHandle = Readonly<{
  db: Database;
  /** Cheap round-trip for readiness checks. */
  ping: () => Promise<void>;
  /** Waits for checked-out clients to be released, then closes the pool. */
  close: () => Promise<void>;
}>;

const logger = getLogger([rootCategory, 'db']);

export const createDb = ({ url, poolMax }: DbConfig): DbHandle => {
  const pool = new Pool({ connectionString: url, max: poolMax });
  // An idle client losing its connection (e.g. Postgres restarts) emits `error` on the pool;
  // without a listener Node treats it as unhandled and exits. The pool replaces the client.
  pool.on('error', (error) => {
    logger.warning('idle database connection failed: {error}', { error });
  });
  const db = drizzle({ client: pool, casing: 'snake_case' });

  return {
    db,
    ping: async () => {
      await db.execute(sql`select 1`);
    },
    close: () => pool.end(),
  };
};
