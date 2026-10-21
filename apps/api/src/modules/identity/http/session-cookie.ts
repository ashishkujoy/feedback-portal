import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { CookieOptions } from 'hono/utils/cookie';

/** Neutral name. With `secure`, browsers see `__Host-session` (Secure, Path=/, no Domain). */
const cookieName = 'session';

/** `secure` is on in production; off for `pnpm dev` on plain http://localhost. */
export type SessionCookieOptions = Readonly<{ secure: boolean }>;

/**
 * Attributes for every auth cookie. With `secure`, the `__Host-` prefix makes browsers reject the
 * cookie unless it is Secure, Path=/ and has no Domain, so a subdomain can't plant it.
 */
export const cookieAttributes = ({ secure }: SessionCookieOptions): CookieOptions =>
  secure
    ? { httpOnly: true, sameSite: 'Lax', path: '/', secure: true, prefix: 'host' }
    : { httpOnly: true, sameSite: 'Lax', path: '/' };

/** Reads a cookie set with `cookieAttributes`; in production only the prefixed name counts. */
export const readCookie = (
  c: Context,
  name: string,
  { secure }: SessionCookieOptions,
): string | undefined => (secure ? getCookie(c, name, 'host') : getCookie(c, name));

export const setSessionCookie = (
  c: Context,
  token: string,
  { expiresAt, now }: Readonly<{ expiresAt: Date; now: Date }>,
  options: SessionCookieOptions,
): void => {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
  setCookie(c, cookieName, token, { ...cookieAttributes(options), maxAge });
};

export const readSessionCookie = (c: Context, options: SessionCookieOptions): string | undefined =>
  readCookie(c, cookieName, options);

export const clearSessionCookie = (c: Context, options: SessionCookieOptions): void => {
  deleteCookie(c, cookieName, cookieAttributes(options));
};
