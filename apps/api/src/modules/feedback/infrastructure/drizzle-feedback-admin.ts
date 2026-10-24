import type { Database, DbExecutor } from '../../../shared/db/client.ts';
import type { BatchAccess } from '../../intern/application/batch-access.ts';
import { createInternRepository } from '../../intern/infrastructure/drizzle-intern-repository.ts';
import type { FeedbackTransaction } from '../application/feedback-admin.ts';
import { createFeedbackQueries } from './drizzle-feedback-queries.ts';
import { createFeedbackRepository } from './drizzle-feedback-repository.ts';

/**
 * Every feedback read and change runs in its own transaction, access checked first. `batchAccess`
 * comes from the cohort module, bound to the same transaction.
 */
export const createFeedbackTransaction =
  (db: Database, batchAccess: (tx: DbExecutor) => BatchAccess): FeedbackTransaction =>
  (work) =>
    db.transaction((tx) =>
      work({
        feedback: createFeedbackRepository(tx),
        queries: createFeedbackQueries(tx),
        interns: createInternRepository(tx),
        batchAccess: batchAccess(tx),
      }),
    );
