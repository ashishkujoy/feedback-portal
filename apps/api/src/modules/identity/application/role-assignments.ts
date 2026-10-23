import type { UserId } from '../domain/user-id.ts';

/**
 * The names of the batches where the user currently holds `role`. Implemented by the cohort
 * module, so identity can refuse to remove a role that is in use without depending on it.
 */
export type RoleAssignments = (
  userId: UserId,
  role: 'mentor' | 'program_manager',
) => Promise<readonly string[]>;
