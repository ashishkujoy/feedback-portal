import type { Sessions } from './sessions.ts';
import type { UserRepository } from './user-repository.ts';

/** What a user-management change may touch, bound to one transaction. */
export type UserAdminScope = Readonly<{
  users: UserRepository;
  sessions: Pick<Sessions, 'revokeAllForUser'>;
}>;

/**
 * Runs `work` in one transaction, one change at a time across the app, so two admins acting on
 * each other at once can't both see the other as the remaining admin. Throwing rolls it back.
 */
export type UserAdminTransaction = <T>(work: (scope: UserAdminScope) => Promise<T>) => Promise<T>;
