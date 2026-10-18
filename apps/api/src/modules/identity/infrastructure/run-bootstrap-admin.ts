import { lockForTransaction } from '../../../shared/db/advisory-lock.ts';
import type { Database } from '../../../shared/db/client.ts';
import {
  bootstrapAdmin,
  type BootstrapAdminInput,
  type BootstrapAdminResult,
} from '../application/bootstrap-admin.ts';
import { newUserId } from '../domain/user-id.ts';
import { createUserRepository } from './drizzle-user-repository.ts';

/** Exported for tests that hold the lock to prove the seed waits for it. */
export const bootstrapAdminLock = 'feedback-portal:bootstrap-admin';

/**
 * Runs the seed in one transaction under an advisory lock, so concurrent runs (e.g. two replicas
 * starting together) are serialised: the second sees the first's admin and does nothing.
 */
export const runBootstrapAdmin = (
  db: Database,
  input: BootstrapAdminInput,
  now: Date = new Date(),
): Promise<BootstrapAdminResult> =>
  db.transaction(async (tx) => {
    await lockForTransaction(tx, bootstrapAdminLock);
    return bootstrapAdmin({ users: createUserRepository(tx), newUserId, now }, input);
  });
