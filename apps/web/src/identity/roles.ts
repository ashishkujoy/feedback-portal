import type { Role } from '@feedback-portal/contracts';

/** The design's labels (sentence case, "Programme"). */
export const roleLabels: Readonly<Record<Role, string>> = {
  admin: 'Admin',
  program_manager: 'Programme manager',
  mentor: 'Mentor',
};

const byPrivilege: readonly Role[] = ['admin', 'program_manager', 'mentor'];

/** The design shows one role per user; someone holding several is shown as the most privileged. */
export const primaryRole = (roles: readonly Role[]): Role | undefined =>
  byPrivilege.find((role) => roles.includes(role));
