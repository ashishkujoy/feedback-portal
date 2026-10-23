import type { Role } from '@feedback-portal/contracts';
import { conflict, notFound } from '../../../shared/errors/app-error.ts';
import {
  createUser,
  deactivate,
  ensureAnAdminRemains,
  hasRole,
  reactivate,
  setRoles,
  type User,
} from '../domain/user.ts';
import { newUserId, type UserId } from '../domain/user-id.ts';
import type { UserAdminScope, UserAdminTransaction } from './user-admin.ts';
import type { UserRepository } from './user-repository.ts';

export type ManageUsersDeps = Readonly<{
  users: UserRepository;
  transaction: UserAdminTransaction;
  now: () => Date;
}>;

/** The signed-in admin making the change: the granter, and the subject of the self-rules. */
type Actor = Readonly<{ actor: UserId }>;

const load = async ({ users }: UserAdminScope, id: UserId): Promise<User> => {
  const user = await users.findById(id);
  if (!user) throw notFound('User not found');
  return user;
};

const isActiveAdmin = (user: User): boolean => user.isActive && hasRole(user, 'admin');

/** Saves `next` if it changed; if it stopped being an active admin, one must remain. */
const commit = async (scope: UserAdminScope, user: User, next: User): Promise<User> => {
  if (next === user) return user;
  await scope.users.save(next);
  if (isActiveAdmin(user) && !isActiveAdmin(next)) {
    // Counted inside the locked transaction, so it includes every committed change.
    ensureAnAdminRemains(await scope.users.countActiveAdmins());
  }
  return next;
};

const roleInUseMessages = {
  mentor: (name: string, batches: string) =>
    `${name} is a mentor of ${batches}. Unassign them there first.`,
  program_manager: (name: string, batches: string) =>
    `${name} is the programme manager of ${batches}. Assign another programme manager there first.`,
} as const;

/**
 * A batch member must hold the matching role (cohort), so a role in use in a batch can't be
 * removed. Checked inside the locked transaction, so a concurrent assignment can't slip past.
 */
const ensureRolesNotInUse = async (scope: UserAdminScope, user: User, next: User) => {
  const removed = (['mentor', 'program_manager'] as const).filter(
    (role) => hasRole(user, role) && !hasRole(next, role),
  );
  const uses = await Promise.all(
    removed.map(async (role) => ({ role, batches: await scope.roleAssignments(user.id, role) })),
  );
  const inUse = uses.find(({ batches }) => batches.length > 0);
  if (inUse) {
    throw conflict(
      roleInUseMessages[inUse.role](user.name, inUse.batches.join(', ')),
      'role_in_use',
    );
  }
};

export const listUsers = ({ users }: ManageUsersDeps): Promise<readonly User[]> => users.list();

/** No invite is sent: the user signs in with Google using this email. */
export const addUser = (
  { transaction, now }: ManageUsersDeps,
  { actor, email, name, roles }: Actor & Readonly<{ email: string; name: string; roles: Role[] }>,
): Promise<User> =>
  transaction(async ({ users }) => {
    const user = createUser({ id: newUserId(), email, name, roles, grantedBy: actor, now: now() });
    await users.save(user);
    return user;
  });

export const setUserRoles = (
  { transaction, now }: ManageUsersDeps,
  { actor, userId, roles }: Actor & Readonly<{ userId: UserId; roles: readonly Role[] }>,
): Promise<User> =>
  transaction(async (scope) => {
    const user = await load(scope, userId);
    const next = setRoles(user, roles, { by: actor, now: now() });
    await ensureRolesNotInUse(scope, user, next);
    return commit(scope, user, next);
  });

/** Also signs them out everywhere, in the same transaction. */
export const deactivateUser = (
  { transaction, now }: ManageUsersDeps,
  { actor, userId }: Actor & Readonly<{ userId: UserId }>,
): Promise<User> =>
  transaction(async (scope) => {
    const user = await load(scope, userId);
    const next = await commit(scope, user, deactivate(user, { by: actor, now: now() }));
    if (next !== user) await scope.sessions.revokeAllForUser(user.id);
    return next;
  });

export const reactivateUser = (
  { transaction, now }: ManageUsersDeps,
  { userId }: Actor & Readonly<{ userId: UserId }>,
): Promise<User> =>
  transaction(async (scope) => {
    const user = await load(scope, userId);
    return commit(scope, user, reactivate(user, { now: now() }));
  });
