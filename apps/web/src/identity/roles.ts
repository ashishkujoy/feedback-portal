import type { MeResponse, Role } from '@feedback-portal/contracts';

/** The design's labels (sentence case, "Programme"). */
export const roleLabels: Readonly<Record<Role, string>> = {
  admin: 'Admin',
  program_manager: 'Programme manager',
  mentor: 'Mentor',
};

const byPrivilege: readonly Role[] = ['admin', 'program_manager', 'mentor'];

/** Most privileged first: Admin, Programme manager, Mentor. */
export const rolesByPrivilege = (roles: readonly Role[]): Role[] =>
  byPrivilege.filter((role) => roles.includes(role));

/** The design shows one role per user; someone holding several is shown as the most privileged. */
export const primaryRole = (roles: readonly Role[]): Role | undefined =>
  byPrivilege.find((role) => roles.includes(role));

export const isAdmin = (me: MeResponse): boolean => me.roles.includes('admin');

/** Mentors see only their own batches, and the design labels the page that way. */
export const batchesLabel = (me: MeResponse): string =>
  primaryRole(me.roles) === 'mentor' ? 'My batches' : 'Batches';
