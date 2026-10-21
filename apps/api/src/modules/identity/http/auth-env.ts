import type { AppEnv } from '../../../shared/http/app-env.ts';
import type { User } from '../domain/user.ts';

/** For routes behind `authenticate`: `currentUser` is always set. */
export type AuthEnv = AppEnv & { Variables: { currentUser: User } };
