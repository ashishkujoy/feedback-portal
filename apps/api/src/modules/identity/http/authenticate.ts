import { getLogger } from '@logtape/logtape';
import { createMiddleware } from 'hono/factory';
import { unauthenticated } from '../../../shared/errors/app-error.ts';
import { rootCategory } from '../../../shared/logging/logging.ts';
import { resolveCurrentUser } from '../application/current-user.ts';
import type { Sessions } from '../application/sessions.ts';
import type { UserRepository } from '../application/user-repository.ts';
import type { AuthEnv } from './auth-env.ts';
import { clearSessionCookie, readSessionCookie, setSessionCookie } from './session-cookie.ts';

export type AuthenticateDeps = Readonly<{
  users: UserRepository;
  sessions: Sessions;
  secureCookies: boolean;
  now: () => Date;
}>;

const logger = getLogger([rootCategory, 'auth']);

/**
 * Turns the session cookie into `c.var.currentUser` (active, with roles), or answers 401.
 * A rejected cookie is cleared; a renewed session gets its cookie re-sent with the new expiry.
 */
export const authenticate = ({ users, sessions, secureCookies, now }: AuthenticateDeps) => {
  const cookieOptions = { secure: secureCookies };
  return createMiddleware<AuthEnv>(async (c, next) => {
    const token = readSessionCookie(c, cookieOptions);
    if (token === undefined) throw unauthenticated();

    const result = await resolveCurrentUser({ users, sessions }, token);
    if (!result.ok) {
      if (result.reason !== 'no_session') {
        logger.info('session rejected: {reason}', { reason: result.reason, userId: result.userId });
      }
      clearSessionCookie(c, cookieOptions);
      throw unauthenticated();
    }

    if (result.renewed) {
      setSessionCookie(
        c,
        token,
        { expiresAt: result.session.expiresAt, now: now() },
        cookieOptions,
      );
    }
    c.set('currentUser', result.user);
    await next();
  });
};
