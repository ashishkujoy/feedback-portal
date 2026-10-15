import { sql } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { DbConfig } from '../config/config.ts';

// The relational-query schema is added once tables exist (3.1).
export type Database = PostgresJsDatabase;

export type DbHandle = Readonly<{
  db: Database;
  /** Cheap round-trip for readiness checks. */
  ping: () => Promise<void>;
  /** Waits for in-flight queries, then closes the pool. */
  close: () => Promise<void>;
}>;

export const createDb = ({ url, poolMax }: DbConfig): DbHandle => {
  // `onnotice` silences postgres.js' default console output for NOTICE messages
  // (e.g. "extension already exists, skipping").
  const client = postgres(url, { max: poolMax, onnotice: () => {} });
  const db = drizzle({ client });

  return {
    db,
    ping: async () => {
      await db.execute(sql`select 1`);
    },
    close: () => client.end({ timeout: 5 }),
  };
};
