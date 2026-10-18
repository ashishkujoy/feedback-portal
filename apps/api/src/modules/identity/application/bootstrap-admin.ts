import { parseEmail } from '../domain/email.ts';
import { createUser, grantRole, reactivate } from '../domain/user.ts';
import type { UserId } from '../domain/user-id.ts';
import type { UserRepository } from './user-repository.ts';

export type BootstrapAdminDeps = Readonly<{
  users: UserRepository;
  newUserId: () => UserId;
  now: Date;
}>;

/** `name: null` derives the name from the email's local part. */
export type BootstrapAdminInput = Readonly<{ email: string; name: string | null }>;

export type BootstrapAdminResult =
  | Readonly<{ outcome: 'admin_exists' }>
  | Readonly<{ outcome: 'created' | 'restored'; userId: UserId }>;

/**
 * Makes sure the system has an active admin. Acts only when there is none, so it never undoes an
 * admin's decisions, yet re-running it restores access if every admin was lost (break-glass).
 * Grants made here are system grants (`grantedBy: null`). Run it under a lock (see the CLI).
 */
export const bootstrapAdmin = async (
  { users, newUserId, now }: BootstrapAdminDeps,
  input: BootstrapAdminInput,
): Promise<BootstrapAdminResult> => {
  if ((await users.countActiveAdmins()) > 0) return { outcome: 'admin_exists' };

  const email = parseEmail(input.email);
  const existing = await users.findByEmail(email);
  if (!existing) {
    const user = createUser({
      id: newUserId(),
      email,
      name: input.name ?? email.slice(0, email.indexOf('@')),
      roles: ['admin'],
      grantedBy: null,
      now,
    });
    await users.save(user);
    return { outcome: 'created', userId: user.id };
  }

  const restored = reactivate(grantRole(existing, 'admin', { by: null, now }), { now });
  if (restored !== existing) await users.save(restored);
  return { outcome: 'restored', userId: existing.id };
};
