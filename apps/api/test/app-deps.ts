import type { AppDeps } from '../src/app.ts';
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
