import { Role } from '@feedback-portal/contracts';
import { z } from 'zod';
import {
  conflict,
  unauthenticated,
  validationFailed,
  type AppError,
} from '../../../shared/errors/app-error.ts';
import { fieldIssues } from '../../../shared/errors/field-issues.ts';
import { Email } from './email.ts';
import type { UserId } from './user-id.ts';

/** `grantedBy: null` is a system grant (the bootstrap seed). */
export type RoleGrant = Readonly<{ role: Role; grantedBy: UserId | null; grantedAt: Date }>;

export type User = Readonly<{
  id: UserId;
  email: Email;
  name: string;
  googleSub: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  /** Part of the aggregate: `user_roles` rows are owned by their user. Never empty. */
  roles: readonly RoleGrant[];
  createdAt: Date;
  updatedAt: Date;
}>;

const NewUser = z.object({
  email: Email,
  name: z
    .string()
    .trim()
    .min(1, { error: 'Name is required' })
    .max(200, { error: 'Name must be at most 200 characters' }),
  roles: z.array(Role).min(1, { error: 'At least one role is required' }),
});

export type CreateUserInput = Readonly<{
  id: UserId;
  email: string;
  name: string;
  roles: readonly Role[];
  grantedBy: UserId | null;
  now: Date;
}>;

/**
 * Every operation returns a new `User`, or the same object when nothing changes, so callers can
 * skip the write with `next === user`. Time and ids come from the caller.
 */
export const createUser = ({ id, email, name, roles, grantedBy, now }: CreateUserInput): User => {
  const result = NewUser.safeParse({ email, name, roles });
  if (!result.success) throw validationFailed(fieldIssues(result.error));
  const valid = result.data;
  return {
    id,
    email: valid.email,
    name: valid.name,
    googleSub: null,
    avatarUrl: null,
    isActive: true,
    lastLoginAt: null,
    roles: [...new Set(valid.roles)].map((role) => ({ role, grantedBy, grantedAt: now })),
    createdAt: now,
    updatedAt: now,
  };
};

export const hasRole = (user: User, role: Role): boolean =>
  user.roles.some((grant) => grant.role === role);

export const roleSet = (user: User): ReadonlySet<Role> =>
  new Set(user.roles.map((grant) => grant.role));

/** Granting a role the user already holds is a no-op, which keeps the admin API idempotent. */
export const grantRole = (
  user: User,
  role: Role,
  { by, now }: Readonly<{ by: UserId | null; now: Date }>,
): User =>
  hasRole(user, role)
    ? user
    : { ...user, roles: [...user.roles, { role, grantedBy: by, grantedAt: now }], updatedAt: now };

/** A user without roles could sign in and see nothing; deactivate them instead. */
export const revokeRole = (user: User, role: Role, { now }: Readonly<{ now: Date }>): User => {
  if (!hasRole(user, role)) return user;
  if (user.roles.length === 1) {
    throw conflict(
      'A user must keep at least one role; deactivate them instead',
      'user_requires_role',
    );
  }
  return { ...user, roles: user.roles.filter((grant) => grant.role !== role), updatedAt: now };
};

/** Nobody can deactivate themselves, so an admin can't lock themselves out. */
export const deactivate = (user: User, { by, now }: Readonly<{ by: UserId; now: Date }>): User => {
  if (by === user.id) throw conflict('You cannot deactivate yourself', 'cannot_deactivate_self');
  return user.isActive ? { ...user, isActive: false, updatedAt: now } : user;
};

export const reactivate = (user: User, { now }: Readonly<{ now: Date }>): User =>
  user.isActive ? user : { ...user, isActive: true, updatedAt: now };

/**
 * The one error for every failed sign-in (unknown email, inactive, linked to another Google
 * account), so the response never reveals which. 3.6 uses it for the unknown-email case too.
 */
export const signInRejected = (): AppError => unauthenticated('Sign-in failed');

export type SignInInput = Readonly<{ googleSub: string; avatarUrl: string | null; now: Date }>;

/** Links `googleSub` on the first sign-in; after that only the same Google account may sign in. */
export const signIn = (user: User, { googleSub, avatarUrl, now }: SignInInput): User => {
  if (!user.isActive) throw signInRejected();
  if (user.googleSub !== null && user.googleSub !== googleSub) throw signInRejected();
  return { ...user, googleSub, avatarUrl, lastLoginAt: now, updatedAt: now };
};

/** Checked by the admin use cases (3.8) with a count from the repository, after the change. */
export const ensureAnAdminRemains = (activeAdminCountAfterChange: number): void => {
  if (activeAdminCountAfterChange < 1) {
    throw conflict('At least one active admin is required');
  }
};
