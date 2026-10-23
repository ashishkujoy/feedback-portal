import { sql } from 'drizzle-orm';
import type { DbExecutor } from './client.ts';

/**
 * Waits for, then holds, a Postgres advisory lock until the surrounding transaction ends.
 * Serialises one-off jobs (e.g. the seed) that may start concurrently. Call it inside a transaction.
 */
export const lockForTransaction = async (tx: DbExecutor, name: string): Promise<void> => {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${name}, 0))`);
};

/**
 * Held by every change to who is who: user roles and status (identity) and batch membership
 * (cohort), so a rule that spans both, like "a batch mentor holds the Mentor role", can't race.
 */
export const peopleAdminLock = 'feedback-portal:people-admin';
