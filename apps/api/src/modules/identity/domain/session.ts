import type { UserId } from './user-id.ts';

/** `id` is the SHA-256 hex of the session token; the token itself only lives in the cookie. */
export type Session = Readonly<{
  id: string;
  userId: UserId;
  expiresAt: Date;
  createdAt: Date;
  userAgent: string | null;
  ip: string | null;
}>;

const day = 24 * 60 * 60 * 1000;

/**
 * A session ends after `idleMs` without use; use extends it, but never beyond `maxLifetimeMs`
 * from sign-in. A security decision, so constants rather than config.
 */
export const sessionPolicy = { idleMs: 7 * day, maxLifetimeMs: 30 * day } as const;

export const initialExpiry = (now: Date): Date => new Date(now.getTime() + sessionPolicy.idleMs);

export const isExpired = (session: Session, now: Date): boolean =>
  now.getTime() >= session.expiresAt.getTime();

/**
 * The expiry after a use at `now`. Extended only once less than half the idle period is left,
 * so an active session is written every few days rather than on every request. Returns the same
 * `Date` object when nothing changes.
 */
export const renewedExpiry = (session: Session, now: Date): Date => {
  const remaining = session.expiresAt.getTime() - now.getTime();
  if (remaining >= sessionPolicy.idleMs / 2) return session.expiresAt;
  const cap = session.createdAt.getTime() + sessionPolicy.maxLifetimeMs;
  const next = Math.min(now.getTime() + sessionPolicy.idleMs, cap);
  return next > session.expiresAt.getTime() ? new Date(next) : session.expiresAt;
};
