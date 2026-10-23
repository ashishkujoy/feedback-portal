import type { AdminUser, Role } from '@feedback-portal/contracts';

/** A role tab, or `undefined` for All. */
export type RoleTab = Role | undefined;

export type TabCounts = Readonly<{ all: number } & Record<Role, number>>;

/** Users holding `role`; a user with several roles is in each of their tabs. */
export const byRole = (users: readonly AdminUser[], role: RoleTab): AdminUser[] =>
  role ? users.filter((user) => user.roles.includes(role)) : [...users];

/** Case-insensitive match on name or email; a blank search matches everyone. */
export const matches = (user: AdminUser, search: string): boolean => {
  const needle = search.trim().toLowerCase();
  return (
    needle === '' ||
    user.name.toLowerCase().includes(needle) ||
    user.email.toLowerCase().includes(needle)
  );
};

/** Per-tab totals. They ignore the search, as the design's do. */
export const tabCounts = (users: readonly AdminUser[]): TabCounts => ({
  all: users.length,
  admin: byRole(users, 'admin').length,
  program_manager: byRole(users, 'program_manager').length,
  mentor: byRole(users, 'mentor').length,
});

const collator = new Intl.Collator(undefined, { sensitivity: 'base' });

/** By name as people read it: case and accents don't split the list (the API's order does). */
export const byName = (users: readonly AdminUser[]): AdminUser[] =>
  users.toSorted((a, b) => collator.compare(a.name, b.name) || a.id.localeCompare(b.id));
