import type { Session } from '../domain/session.ts';
import type { UserId } from '../domain/user-id.ts';

/** Sessions are keyed by the token's hash; nothing here ever sees a raw token. */
export type SessionRepository = Readonly<{
  insert: (session: Session) => Promise<void>;
  findById: (id: string) => Promise<Session | null>;
  updateExpiry: (id: string, expiresAt: Date) => Promise<void>;
  delete: (id: string) => Promise<void>;
  deleteForUser: (userId: UserId) => Promise<void>;
  /** Removes sessions whose `expiresAt` is at or before `now`. */
  deleteExpired: (now: Date) => Promise<void>;
}>;
