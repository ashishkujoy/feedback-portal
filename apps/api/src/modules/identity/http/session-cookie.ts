import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { CookieOptions } from 'hono/utils/cookie';

/** Neutral name. With `secure`, browsers see `__Host-session` (Secure, Path=/, no Domain). */
const cookieName = 'session';

/** `secure` is on in production; off for `pnpm dev` on plain http://localhost. */
export type SessionCookieOptions = Readonly<{ secure: boolean }>;

const attributes = ({ secure }: SessionCookieOptions): CookieOptions =>
  secure
    ? { httpOnly: true, sameSite: 'Lax', path: '/', secure: true, prefix: 'host' }
    : { httpOnly: true, sameSite: 'Lax', path: '/' };

export const setSessionCookie = (
  c: Context,
  token: string,
  { expiresAt, now }: Readonly<{ expiresAt: Date; now: Date }>,
  options: SessionCookieOptions,
): void => {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
  setCookie(c, cookieName, token, { ...attributes(options), maxAge });
};

export const readSessionCookie = (
  c: Context,
  { secure }: SessionCookieOptions,
): string | undefined => (secure ? getCookie(c, cookieName, 'host') : getCookie(c, cookieName));

export const clearSessionCookie = (c: Context, options: SessionCookieOptions): void => {
  deleteCookie(c, cookieName, attributes(options));
};
