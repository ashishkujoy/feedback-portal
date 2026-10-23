import type { BatchQueries } from './batch-queries.ts';
import type { BatchRepository } from './batch-repository.ts';
import type { Candidates } from './candidates.ts';

/** What a batch change may touch, bound to one transaction. */
export type BatchAdminScope = Readonly<{
  batches: BatchRepository;
  candidates: Candidates;
  queries: BatchQueries;
}>;

/**
 * Runs `work` in one transaction under the people-admin lock (shared with user management), so
 * "assign as mentor" and "remove the Mentor role" can't interleave. Throwing rolls it back.
 */
export type BatchAdminTransaction = <T>(work: (scope: BatchAdminScope) => Promise<T>) => Promise<T>;
