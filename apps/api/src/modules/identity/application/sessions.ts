import { initialExpiry, isExpired, renewedExpiry, type Session } from '../domain/session.ts';
import type { UserId } from '../domain/user-id.ts';
import type { SessionRepository } from './session-repository.ts';
import { generateToken, hashToken, isWellFormedToken } from './session-token.ts';

export type SessionsDeps = Readonly<{ sessions: SessionRepository; now: () => Date }>;

export type SessionMetadata = Readonly<{ userAgent: string | null; ip: string | null }>;

/** `renewed` tells the caller to re-send the cookie with the new expiry. */
export type ValidatedSession = Readonly<{ session: Session; renewed: boolean }>;

const maxUserAgentLength = 512;

export const createSessions = ({ sessions, now }: SessionsDeps) => ({
  /** Starts a session at sign-in. Returns the raw token for the cookie; only its hash is stored. */
  create: async (
    userId: UserId,
    { userAgent, ip }: SessionMetadata,
  ): Promise<Readonly<{ token: string; session: Session }>> => {
    const at = now();
    // Sign-ins are rare and the delete is indexed, so no separate cleanup job is needed.
    await sessions.deleteExpired(at);
    const token = generateToken();
    const session: Session = {
      id: hashToken(token),
      userId,
      expiresAt: initialExpiry(at),
      createdAt: at,
      userAgent: userAgent?.slice(0, maxUserAgentLength) ?? null,
      ip,
    };
    await sessions.insert(session);
    return { token, session };
  },

  /** The session for a cookie token, renewed when due; `null` if unknown or expired. */
  validate: async (token: string): Promise<ValidatedSession | null> => {
    if (!isWellFormedToken(token)) return null;
    const session = await sessions.findById(hashToken(token));
    if (!session) return null;
    const at = now();
    if (isExpired(session, at)) {
      await sessions.delete(session.id);
      return null;
    }
    const expiresAt = renewedExpiry(session, at);
    if (expiresAt === session.expiresAt) return { session, renewed: false };
    await sessions.updateExpiry(session.id, expiresAt);
    return { session: { ...session, expiresAt }, renewed: true };
  },

  /** Logout. Unknown tokens are ignored. */
  revoke: async (token: string): Promise<void> => {
    if (isWellFormedToken(token)) await sessions.delete(hashToken(token));
  },

  /** Signs a user out everywhere, e.g. on deactivation. */
  revokeAllForUser: (userId: UserId): Promise<void> => sessions.deleteForUser(userId),
});

export type Sessions = ReturnType<typeof createSessions>;
