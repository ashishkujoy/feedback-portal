import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import {
  clearSessionCookie,
  readSessionCookie,
  type SessionCookieOptions,
  setSessionCookie,
} from './session-cookie.ts';

const now = new Date('2026-01-01T00:00:00.000Z');
const expiresAt = new Date('2026-01-08T00:00:00.000Z');
const token = 'a'.repeat(43);

const appWith = (options: SessionCookieOptions) =>
  new Hono()
    .get('/set', (c) => {
      setSessionCookie(c, token, { expiresAt, now }, options);
      return c.body(null, 204);
    })
    .get('/read', (c) => c.json({ token: readSessionCookie(c, options) ?? null }))
    .get('/clear', (c) => {
      clearSessionCookie(c, options);
      return c.body(null, 204);
    });

const setCookieHeader = async (options: SessionCookieOptions, path: string) =>
  (await appWith(options).request(path)).headers.get('set-cookie');

describe('session cookie', () => {
  it('in production: __Host- prefix, Secure, HttpOnly, SameSite=Lax, Path=/, Max-Age', async () => {
    expect(await setCookieHeader({ secure: true }, '/set')).toBe(
      `__Host-session=${token}; Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=Lax`,
    );
  });

  it('in development: plain name, not Secure', async () => {
    expect(await setCookieHeader({ secure: false }, '/set')).toBe(
      `session=${token}; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax`,
    );
  });

  it.each([
    [true, '__Host-session'],
    [false, 'session'],
  ])('reads the cookie back (secure: %s)', async (secure, name) => {
    const response = await appWith({ secure }).request('/read', {
      headers: { cookie: `${name}=${token}` },
    });

    expect(await response.json()).toEqual({ token });
  });

  it('ignores the unprefixed cookie in production', async () => {
    // A cookie without the prefix could have been planted by a subdomain or over http.
    const response = await appWith({ secure: true }).request('/read', {
      headers: { cookie: `session=${token}` },
    });

    expect(await response.json()).toEqual({ token: null });
  });

  it('clears the cookie with the same attributes', async () => {
    expect(await setCookieHeader({ secure: true }, '/clear')).toBe(
      '__Host-session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax',
    );
  });
});
