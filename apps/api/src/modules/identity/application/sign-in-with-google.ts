import { AppError } from '../../../shared/errors/app-error.ts';
import { Email } from '../domain/email.ts';
import type { Session } from '../domain/session.ts';
import { signIn } from '../domain/user.ts';
import type { UserId } from '../domain/user-id.ts';
import type { GoogleIdentity } from './google-auth.ts';
import type { Sessions, SessionMetadata } from './sessions.ts';
import type { UserRepository } from './user-repository.ts';

export type SignInWithGoogleDeps = Readonly<{
  users: UserRepository;
  sessions: Sessions;
  now: () => Date;
}>;

/** For logs only; the browser always sees the same generic failure. */
export type SignInFailureReason =
  | 'email_not_verified'
  | 'unknown_email'
  | 'inactive'
  | 'google_account_mismatch';

export type SignInWithGoogleResult =
  | Readonly<{ ok: true; userId: UserId; token: string; session: Session }>
  | Readonly<{ ok: false; reason: SignInFailureReason; userId?: UserId }>;

/** Only users an admin added (by email) and who are active can sign in. */
export const signInWithGoogle = async (
  { users, sessions, now }: SignInWithGoogleDeps,
  { identity, metadata }: Readonly<{ identity: GoogleIdentity; metadata: SessionMetadata }>,
): Promise<SignInWithGoogleResult> => {
  if (!identity.emailVerified) return { ok: false, reason: 'email_not_verified' };
  const email = Email.safeParse(identity.email);
  const user = email.success ? await users.findByEmail(email.data) : null;
  if (!user) return { ok: false, reason: 'unknown_email' };

  let signedIn;
  try {
    // The name stays as the admin entered it; only the avatar comes from Google.
    signedIn = signIn(user, { googleSub: identity.sub, avatarUrl: identity.picture, now: now() });
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    const reason = user.isActive ? 'google_account_mismatch' : 'inactive';
    return { ok: false, reason, userId: user.id };
  }
  await users.save(signedIn);
  const { token, session } = await sessions.create(user.id, metadata);
  return { ok: true, userId: user.id, token, session };
};
