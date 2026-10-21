import type { Session } from '../domain/session.ts';
import type { User } from '../domain/user.ts';
import type { UserId } from '../domain/user-id.ts';
import type { Sessions } from './sessions.ts';
import type { UserRepository } from './user-repository.ts';

export type CurrentUserDeps = Readonly<{ users: UserRepository; sessions: Sessions }>;

/** For logs only; every failure is the same 401 to the client. */
export type CurrentUserFailureReason = 'no_session' | 'unknown_user' | 'inactive';

export type CurrentUserResult =
  | Readonly<{ ok: true; user: User; session: Session; renewed: boolean }>
  | Readonly<{ ok: false; reason: CurrentUserFailureReason; userId?: UserId }>;

/** The active user behind a session token. An inactive user's session is revoked. */
export const resolveCurrentUser = async (
  { users, sessions }: CurrentUserDeps,
  token: string,
): Promise<CurrentUserResult> => {
  const validated = await sessions.validate(token);
  if (!validated) return { ok: false, reason: 'no_session' };
  const { session, renewed } = validated;
  const user = await users.findById(session.userId);
  if (!user) return { ok: false, reason: 'unknown_user' };
  if (!user.isActive) {
    await sessions.revoke(token);
    return { ok: false, reason: 'inactive', userId: user.id };
  }
  return { ok: true, user, session, renewed };
};
