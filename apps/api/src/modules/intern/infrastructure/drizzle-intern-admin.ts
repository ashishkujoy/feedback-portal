import type { Database, DbExecutor } from '../../../shared/db/client.ts';
import type { BatchAccess } from '../application/batch-access.ts';
import type { InternAdminTransaction } from '../application/intern-admin.ts';
import { createInternRepository } from './drizzle-intern-repository.ts';

/**
 * Every intern change runs in its own transaction. `batchAccess` comes from the cohort module,
 * bound to the same transaction.
 */
export const createInternAdminTransaction =
  (db: Database, batchAccess: (tx: DbExecutor) => BatchAccess): InternAdminTransaction =>
  (work) =>
    db.transaction((tx) =>
      work({ interns: createInternRepository(tx), batchAccess: batchAccess(tx) }),
    );
