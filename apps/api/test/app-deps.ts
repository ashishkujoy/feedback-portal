import type { Role } from '@feedback-portal/contracts';
import type { AppDeps } from '../src/app.ts';
import type { Sessions } from '../src/modules/identity/application/sessions.ts';
import type { UserRepository } from '../src/modules/identity/application/user-repository.ts';
import { createUser, deactivate, type User } from '../src/modules/identity/domain/user.ts';
import { newUserId } from '../src/modules/identity/domain/user-id.ts';
import type { AuthRoutesDeps } from '../src/modules/identity/http/auth.routes.ts';

const unused = (): never => {
  throw new Error('not used by this test');
};

/** Auth deps for tests that don't exercise sign-in: Google off, repositories never called. */
export const unusedAuthDeps: AuthRoutesDeps = {
  users: {
    findById: unused,
    findByEmail: unused,
    list: unused,
    save: unused,
    countActiveAdmins: unused,
  },
  sessions: { create: unused, validate: unused, revoke: unused, revokeAllForUser: unused },
  googleAuth: null,
  webAppUrl: 'http://web.test',
  secureCookies: false,
  now: () => new Date(),
};

export const appDeps = (ping: AppDeps['ping']): AppDeps => ({ ping, auth: unusedAuthDeps });

type SignInAsOptions = Readonly<{
  roles?: readonly [Role, ...Role[]];
  active?: boolean;
  secureCookies?: boolean;
}>;

/**
 * Saves a user and starts a session for them, skipping Google, so route tests can call protected
 * routes. `cookie` is the request header value.
 */
export const signInAs = async (
  { users, sessions }: Readonly<{ users: UserRepository; sessions: Sessions }>,
  { roles = ['mentor'], active = true, secureCookies = false }: SignInAsOptions = {},
) => {
  const at = new Date();
  let user: User = createUser({
    id: newUserId(),
    email: `${newUserId()}@example.com`,
    name: 'Signed In',
    roles: [...roles],
    grantedBy: null,
    now: at,
  });
  if (!active) user = deactivate(user, { by: newUserId(), now: at });
  await users.save(user);
  const { token, session } = await sessions.create(user.id, { userAgent: null, ip: null });
  const name = secureCookies ? '__Host-session' : 'session';
  return { user, token, session, cookie: `${name}=${token}` };
};
