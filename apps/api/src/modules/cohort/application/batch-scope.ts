import type { UserId } from '../../identity/domain/user-id.ts';
import type { BatchId } from '../domain/batch-id.ts';

/** Who is looking. Admins see every batch; anyone else only batches they're currently on. */
export type Viewer = Readonly<{ id: UserId; isAdmin: boolean }>;

/**
 * "Can this viewer see this batch?" for single-batch actions. Lists apply the same rule in SQL
 * (`visibleBatchCondition`), so it is defined once. A batch the viewer can't see is a 404.
 */
export type BatchScope = Readonly<{
  canSee: (viewer: Viewer, batchId: BatchId) => Promise<boolean>;
}>;
