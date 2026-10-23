import { and, eq, sql, type SQL } from 'drizzle-orm';
import { alias, type AnyPgColumn } from 'drizzle-orm/pg-core';
import type { DbExecutor } from '../../../shared/db/client.ts';
import type { BatchScope, Viewer } from '../application/batch-scope.ts';
import { batches, batchMembers } from './schema.ts';

// Aliased, so the condition also works in queries that already select from batch_members. In raw
// `sql` an alias renders as its bare name, so the FROM clause names the table explicitly.
const aliasName = 'visible_via';
const visibleVia = alias(batchMembers, aliasName);

/**
 * The visibility rule as a WHERE condition on any batch-scoped query: admins see every batch,
 * anyone else only batches where they have a current assignment (any role). Pass the column that
 * holds the batch id, e.g. `batches.id` or (Phase 7) `interns.batchId`.
 */
export const visibleBatchCondition = (viewer: Viewer, batchId: AnyPgColumn): SQL =>
  viewer.isAdmin
    ? sql`true`
    : sql`exists (select 1 from ${batchMembers} as ${sql.identifier(aliasName)} where ${and(
        eq(visibleVia.batchId, batchId),
        eq(visibleVia.userId, viewer.id),
        sql`${visibleVia.unassignedAt} is null`,
      )})`;

export const createBatchScope = (db: DbExecutor): BatchScope => ({
  canSee: async (viewer, batchId) => {
    const [row] = await db
      .select({ id: batches.id })
      .from(batches)
      .where(and(eq(batches.id, batchId), visibleBatchCondition(viewer, batches.id)));
    return row !== undefined;
  },
});
