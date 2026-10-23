import type { Role } from '@feedback-portal/contracts';
import type { UserId } from '../../identity/domain/user-id.ts';

/**
 * The cohort's view of a person being assigned: just what the rules need, so the batch domain
 * doesn't depend on identity's `User`. The application layer builds it from the user repository.
 */
export type Candidate = Readonly<{ id: UserId; roles: readonly Role[]; isActive: boolean }>;
