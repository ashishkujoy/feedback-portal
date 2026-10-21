import {
  type AdminUser,
  type MeResponse,
  roles as allRoles,
  type Role,
} from '@feedback-portal/contracts';
import { roleSet, type User } from '../domain/user.ts';

/** In the order of `roles`, whatever order they were granted in, so responses are stable. */
const orderedRoles = (user: User): Role[] => {
  const held = roleSet(user);
  return allRoles.filter((role) => held.has(role));
};

export const toMeResponse = (user: User): MeResponse => ({
  id: user.id,
  email: user.email,
  name: user.name,
  avatarUrl: user.avatarUrl,
  roles: orderedRoles(user),
});

export const toAdminUser = (user: User): AdminUser => ({
  id: user.id,
  email: user.email,
  name: user.name,
  avatarUrl: user.avatarUrl,
  isActive: user.isActive,
  roles: orderedRoles(user),
  lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  createdAt: user.createdAt.toISOString(),
});
