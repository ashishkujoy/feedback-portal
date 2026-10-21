import { getLogger } from '@logtape/logtape';
import { type Context, Hono } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import { unavailable } from '../../../shared/errors/app-error.ts';
import type { AppEnv } from '../../../shared/http/app-env.ts';
import { clientIp } from '../../../shared/http/client-ip.ts';
import { rootCategory } from '../../../shared/logging/logging.ts';
import type { GoogleAuth } from '../application/google-auth.ts';
import type { Sessions } from '../application/sessions.ts';
import { signInWithGoogle } from '../application/sign-in-with-google.ts';
import type { UserRepository } from '../application/user-repository.ts';
import {
  clearSessionCookie,
  cookieAttributes,
  readCookie,
  readSessionCookie,
  setSessionCookie,
} from './session-cookie.ts';

export type AuthRoutesDeps = Readonly<{
  users: UserRepository;
  sessions: Sessions;
  /** `null` when Google sign-in isn't configured: the routes answer 503. */
  googleAuth: GoogleAuth | null;
  webAppUrl: string;
  secureCookies: boolean;
  now: () => Date;
}>;

const stateCookie = 'oauth_state';
const verifierCookie = 'oauth_verifier';
/** Long enough to pick an account and consent; the flow is abandoned after that. */
const oauthCookieMaxAge = 10 * 60;

const logger = getLogger([rootCategory, 'auth']);

/**
 * `GET /auth/google` starts Google sign-in; `GET /auth/google/callback` finishes it. Every failure
 * redirects to the web app's `/login?error=sign_in_failed`, so the browser never learns why
 * (unknown email, inactive, …); the log records the reason, never the email, code or token.
 * `POST /auth/logout` ends the cookie's session, if any.
 */
export const authRoutes = ({
  users,
  sessions,
  googleAuth,
  webAppUrl,
  secureCookies,
  now,
}: AuthRoutesDeps) => {
  const cookieOptions = { secure: secureCookies };
  const attributes = cookieAttributes(cookieOptions);
  const failureUrl = `${webAppUrl}/login?error=sign_in_failed`;

  const requireGoogle = (): GoogleAuth => {
    if (!googleAuth) throw unavailable('Google sign-in is not configured');
    return googleAuth;
  };

  const reject = (c: Context<AppEnv>, reason: string, userId?: string) => {
    logger.info('google sign-in rejected: {reason}', { reason, ...(userId ? { userId } : {}) });
    return c.redirect(failureUrl, 302);
  };

  return new Hono<AppEnv>()
    .get('/google', (c) => {
      const { url, state, codeVerifier } = requireGoogle().start();
      setCookie(c, stateCookie, state, { ...attributes, maxAge: oauthCookieMaxAge });
      setCookie(c, verifierCookie, codeVerifier, { ...attributes, maxAge: oauthCookieMaxAge });
      return c.redirect(url.toString(), 302);
    })
    .get('/google/callback', async (c) => {
      const google = requireGoogle();
      const storedState = readCookie(c, stateCookie, cookieOptions);
      const codeVerifier = readCookie(c, verifierCookie, cookieOptions);
      // One attempt per flow, whatever the outcome.
      deleteCookie(c, stateCookie, attributes);
      deleteCookie(c, verifierCookie, attributes);

      const { code, state, error } = c.req.query();
      if (error !== undefined) return reject(c, 'google_error');
      if (!code || !state || !storedState || !codeVerifier) return reject(c, 'missing_parameters');
      if (state !== storedState) return reject(c, 'state_mismatch');

      try {
        const exchanged = await google.exchange(code, codeVerifier);
        if (!exchanged.ok) return reject(c, exchanged.reason);

        const result = await signInWithGoogle(
          { users, sessions, now },
          {
            identity: exchanged.identity,
            metadata: { userAgent: c.req.header('user-agent') ?? null, ip: clientIp(c) },
          },
        );
        if (!result.ok) return reject(c, result.reason, result.userId);

        setSessionCookie(
          c,
          result.token,
          { expiresAt: result.session.expiresAt, now: now() },
          cookieOptions,
        );
        logger.info('google sign-in succeeded', { userId: result.userId });
        return c.redirect(`${webAppUrl}/`, 302);
      } catch (caught) {
        // Google unreachable, DB down, a bug: worth an error log, same answer for the browser.
        logger.error('google sign-in failed: {error}', { error: caught });
        return c.redirect(failureUrl, 302);
      }
    })
    .post('/logout', async (c) => {
      // Idempotent: no cookie, or an unknown or expired one, still signs the browser out.
      const token = readSessionCookie(c, cookieOptions);
      if (token !== undefined) await sessions.revoke(token);
      clearSessionCookie(c, cookieOptions);
      return c.body(null, 204);
    });
};
