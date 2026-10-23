import { and, asc, eq, isNull } from 'drizzle-orm';
import type { DbExecutor } from '../../../shared/db/client.ts';
import type { RoleAssignments } from '../../identity/application/role-assignments.ts';
import { batches, batchMembers } from './schema.ts';

/** Identity's `RoleAssignments` port: batches where the user currently holds the role. */
export const createRoleAssignments =
  (db: DbExecutor): RoleAssignments =>
  async (userId, role) =>
    (
      await db
        .select({ name: batches.name })
        .from(batchMembers)
        .innerJoin(batches, eq(batches.id, batchMembers.batchId))
        .where(
          and(
            eq(batchMembers.userId, userId),
            eq(batchMembers.role, role),
            isNull(batchMembers.unassignedAt),
          ),
        )
        .orderBy(asc(batches.name))
    ).map((row) => row.name);
