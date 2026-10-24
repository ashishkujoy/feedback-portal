import { lockForTransaction } from '../../../shared/db/advisory-lock.ts';
import type { Database, DbExecutor } from '../../../shared/db/client.ts';
import type { BatchAccess } from '../application/batch-access.ts';
import type { InternAdminTransaction } from '../application/intern-admin.ts';
import { createImportRuns } from './drizzle-import-runs.ts';
import { createInternQueries } from './drizzle-intern-queries.ts';
import { createInternRepository } from './drizzle-intern-repository.ts';

/**
 * Every intern change, and every read that checks access first, runs in its own transaction. `batchAccess` comes from the cohort module,
 * bound to the same transaction.
 */
export const createInternAdminTransaction =
  (db: Database, batchAccess: (tx: DbExecutor) => BatchAccess): InternAdminTransaction =>
  (work) =>
    db.transaction((tx) =>
      work({
        interns: createInternRepository(tx),
        queries: createInternQueries(tx),
        batchAccess: batchAccess(tx),
        importRuns: createImportRuns(tx),
        lockImports: (batchId) =>
          lockForTransaction(tx, `feedback-portal:airtable-import:${batchId}`),
      }),
    );
