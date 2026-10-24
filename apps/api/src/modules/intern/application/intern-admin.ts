import type { BatchAccess } from './batch-access.ts';
import type { InternQueries } from './intern-queries.ts';
import type { InternRepository } from './intern-repository.ts';

/** What an intern change may touch, bound to one transaction. */
export type InternAdminScope = Readonly<{
  interns: InternRepository;
  queries: InternQueries;
  batchAccess: BatchAccess;
}>;

/** Runs `work` in one transaction; throwing rolls it back. */
export type InternAdminTransaction = <T>(
  work: (scope: InternAdminScope) => Promise<T>,
) => Promise<T>;
