import { and, eq, isNull, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../../shared/db/client.ts';
import type { BatchAccess } from '../../intern/application/batch-access.ts';
import { visibleBatchCondition } from './batch-visibility.ts';
import { batches, batchMembers } from './schema.ts';

/**
 * The intern module's `BatchAccess` port. The batch row is locked `for share`: every batch change
 * (archiving, a new PM) rewrites it, so those wait until the caller's transaction ends.
 */
export const createBatchAccess =
  (db: DbExecutor): BatchAccess =>
  async (viewer, batchId) => {
    const [row] = await db
      .select({
        isArchived: batches.isArchived,
        isProgramManager: sql<boolean>`exists (select 1 from ${batchMembers} where ${and(
          eq(batchMembers.batchId, batches.id),
          eq(batchMembers.userId, viewer.id),
          eq(batchMembers.role, 'program_manager'),
          isNull(batchMembers.unassignedAt),
        )})`,
      })
      .from(batches)
      .where(and(eq(batches.id, batchId), visibleBatchCondition(viewer, batches.id)))
      .for('share', { of: batches });
    if (!row) return null;
    return {
      canManage: viewer.isAdmin || row.isProgramManager,
      isProgramManager: row.isProgramManager,
      isArchived: row.isArchived,
    };
  };
