import { lockForTransaction } from '../../../shared/db/advisory-lock.ts';
import type { Database } from '../../../shared/db/client.ts';
import { createSessions } from '../application/sessions.ts';
import type { UserAdminTransaction } from '../application/user-admin.ts';
import { createSessionRepository } from './drizzle-session-repository.ts';
import { createUserRepository } from './drizzle-user-repository.ts';

/** Exported for tests that hold the lock to prove concurrent changes wait for it. */
export const userAdminLock = 'feedback-portal:user-admin';

/** Every user-management change runs in its own transaction under one advisory lock. */
export const createUserAdminTransaction =
  (db: Database, now: () => Date): UserAdminTransaction =>
  (work) =>
    db.transaction(async (tx) => {
      await lockForTransaction(tx, userAdminLock);
      return work({
        users: createUserRepository(tx),
        sessions: createSessions({ sessions: createSessionRepository(tx), now }),
      });
    });
