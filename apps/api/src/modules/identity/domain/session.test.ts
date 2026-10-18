import { describe, expect, it } from 'vitest';
import { newUserId } from './user-id.ts';
import { initialExpiry, isExpired, renewedExpiry, type Session, sessionPolicy } from './session.ts';

const hour = 60 * 60 * 1000;
const day = 24 * hour;
const t0 = new Date('2026-01-01T00:00:00.000Z');
const at = (ms: number) => new Date(t0.getTime() + ms);

const session = (expiresAt: Date, createdAt = t0): Session => ({
  id: 'hash',
  userId: newUserId(),
  expiresAt,
  createdAt,
  userAgent: null,
  ip: null,
});

describe('session policy', () => {
  it('is 7 days idle, 30 days at most', () => {
    expect(sessionPolicy).toEqual({ idleMs: 7 * day, maxLifetimeMs: 30 * day });
    expect(initialExpiry(t0)).toEqual(at(7 * day));
  });

  it('is expired from expiresAt on', () => {
    const s = session(at(7 * day));

    expect(isExpired(s, at(7 * day - 1))).toBe(false);
    expect(isExpired(s, at(7 * day))).toBe(true);
  });
});

describe('renewedExpiry', () => {
  const fresh = session(initialExpiry(t0));

  it('keeps the same expiry while at least half the idle period is left', () => {
    expect(renewedExpiry(fresh, t0)).toBe(fresh.expiresAt);
    expect(renewedExpiry(fresh, at(3.5 * day))).toBe(fresh.expiresAt);
  });

  it('extends to now + 7 days once less than half is left', () => {
    expect(renewedExpiry(fresh, at(3.5 * day + 1))).toEqual(at(10.5 * day + 1));
  });

  it('never extends beyond 30 days from sign-in', () => {
    const late = session(at(29 * day));

    expect(renewedExpiry(late, at(27 * day))).toEqual(at(30 * day));
  });

  it('keeps the expiry when it already sits at the cap', () => {
    const capped = session(at(30 * day));

    expect(renewedExpiry(capped, at(29 * day))).toBe(capped.expiresAt);
  });
});
