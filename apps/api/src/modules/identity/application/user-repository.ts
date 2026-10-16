import type { Email } from '../domain/email.ts';
import type { User } from '../domain/user.ts';
import type { UserId } from '../domain/user-id.ts';

/** Persistence for the `User` aggregate, roles included. Users are never deleted. */
export type UserRepository = Readonly<{
  findById: (id: UserId) => Promise<User | null>;
  /** Case-insensitive. */
  findByEmail: (email: Email) => Promise<User | null>;
  /** Ordered by name. */
  list: () => Promise<readonly User[]>;
  /** Creates or updates the user and syncs their role grants. Throws `email_taken`. */
  save: (user: User) => Promise<void>;
  /** Users who are active and hold `admin`. */
  countActiveAdmins: () => Promise<number>;
}>;
