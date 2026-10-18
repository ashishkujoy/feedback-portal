import { sql } from 'drizzle-orm';
import type { DbExecutor } from './client.ts';

/**
 * Waits for, then holds, a Postgres advisory lock until the surrounding transaction ends.
 * Serialises one-off jobs (e.g. the seed) that may start concurrently. Call it inside a transaction.
 */
export const lockForTransaction = async (tx: DbExecutor, name: string): Promise<void> => {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${name}, 0))`);
};
