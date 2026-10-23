import { lockForTransaction, peopleAdminLock } from '../../../shared/db/advisory-lock.ts';
import type { Database, DbExecutor } from '../../../shared/db/client.ts';
import type { RoleAssignments } from '../application/role-assignments.ts';
import { createSessions } from '../application/sessions.ts';
import type { UserAdminTransaction } from '../application/user-admin.ts';
import { createSessionRepository } from './drizzle-session-repository.ts';
import { createUserRepository } from './drizzle-user-repository.ts';

/**
 * Every user-management change runs in its own transaction under the people-admin lock (shared
 * with batch membership). `roleAssignments` comes from the cohort module, bound to the same
 * transaction.
 */
export const createUserAdminTransaction =
  (
    db: Database,
    now: () => Date,
    roleAssignments: (tx: DbExecutor) => RoleAssignments,
  ): UserAdminTransaction =>
  (work) =>
    db.transaction(async (tx) => {
      await lockForTransaction(tx, peopleAdminLock);
      return work({
        users: createUserRepository(tx),
        sessions: createSessions({ sessions: createSessionRepository(tx), now }),
        roleAssignments: roleAssignments(tx),
      });
    });
