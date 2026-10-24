import { lockForTransaction, peopleAdminLock } from '../../../shared/db/advisory-lock.ts';
import type { Database, DbExecutor } from '../../../shared/db/client.ts';
import type { BatchAdminTransaction } from '../application/batch-admin.ts';
import type { InternCounts } from '../application/intern-counts.ts';
import { createBatchScope } from './batch-visibility.ts';
import { createBatchQueries } from './drizzle-batch-queries.ts';
import { createBatchRepository } from './drizzle-batch-repository.ts';
import { createCandidates } from './drizzle-candidates.ts';

/**
 * Every batch change runs in its own transaction under the people-admin lock. `internCounts`
 * comes from the intern module, bound to the same transaction.
 */
export const createBatchAdminTransaction =
  (db: Database, internCounts: (tx: DbExecutor) => InternCounts): BatchAdminTransaction =>
  (work) =>
    db.transaction(async (tx) => {
      await lockForTransaction(tx, peopleAdminLock);
      return work({
        batches: createBatchRepository(tx),
        candidates: createCandidates(tx),
        queries: createBatchQueries(tx, internCounts),
        scope: createBatchScope(tx),
      });
    });
