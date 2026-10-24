import type { Viewer } from '../../cohort/application/batch-scope.ts';
import type { BatchId } from '../../cohort/domain/batch-id.ts';

/** What a viewer may do with one batch. */
export type BatchAccessGrant = Readonly<{
  /** Admins, and the batch's current programme manager. */
  canManage: boolean;
  /** The batch's current programme manager (status changes are theirs alone, 7.6). */
  isProgramManager: boolean;
  isArchived: boolean;
}>;

/**
 * `null` when the viewer can't see the batch (or it doesn't exist), which callers answer with a
 * 404. Implemented by the cohort module, so the intern module doesn't read its tables. Inside a
 * transaction, the batch stays as read until it ends (a concurrent archive or PM change waits).
 */
export type BatchAccess = (viewer: Viewer, batchId: BatchId) => Promise<BatchAccessGrant | null>;
