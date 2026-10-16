import { and, asc, count, eq, inArray, notInArray } from 'drizzle-orm';
import type { DbExecutor } from '../../../shared/db/client.ts';
import { isUniqueViolation } from '../../../shared/db/pg-error.ts';
import { conflict } from '../../../shared/errors/app-error.ts';
import type { UserRepository } from '../application/user-repository.ts';
import { Email } from '../domain/email.ts';
import type { RoleGrant, User } from '../domain/user.ts';
import { UserId } from '../domain/user-id.ts';
import { userRoles, users } from './schema.ts';

type UserRow = typeof users.$inferSelect;
type RoleRow = typeof userRoles.$inferSelect;

// Parsing (rather than casting) gives loaded values their brands; a row that doesn't parse is a
// bug or a hand-edited row and surfaces as a 500.
const toGrant = (row: RoleRow): RoleGrant => ({
  role: row.role,
  grantedBy: row.grantedBy === null ? null : UserId.parse(row.grantedBy),
  grantedAt: row.grantedAt,
});

const toUser = (row: UserRow, grants: readonly RoleRow[]): User => ({
  id: UserId.parse(row.id),
  email: Email.parse(row.email),
  name: row.name,
  googleSub: row.googleSub,
  avatarUrl: row.avatarUrl,
  isActive: row.isActive,
  lastLoginAt: row.lastLoginAt,
  roles: grants.map(toGrant),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const writeUser = async (tx: DbExecutor, user: User): Promise<void> => {
  const { roles, ...columns } = user;
  await tx
    .insert(users)
    .values(columns)
    .onConflictDoUpdate({
      target: users.id,
      set: {
        email: user.email,
        name: user.name,
        googleSub: user.googleSub,
        avatarUrl: user.avatarUrl,
        isActive: user.isActive,
        lastLoginAt: user.lastLoginAt,
        updatedAt: user.updatedAt,
      },
    });
  const held = roles.map((grant) => grant.role);
  // Grants that already exist keep their original granted_by / granted_at.
  await tx
    .delete(userRoles)
    .where(and(eq(userRoles.userId, user.id), notInArray(userRoles.role, held)));
  await tx
    .insert(userRoles)
    .values(
      roles.map(({ role, grantedBy, grantedAt }) => ({
        userId: user.id,
        role,
        grantedBy,
        grantedAt,
      })),
    )
    .onConflictDoNothing();
};

const emailTaken = () => conflict('A user with this email already exists', 'email_taken');

export const createUserRepository = (db: DbExecutor): UserRepository => {
  /** One query for the users' grants, whatever their number. */
  const withRoles = async (rows: readonly UserRow[]): Promise<User[]> => {
    if (rows.length === 0) return [];
    const grants = await db
      .select()
      .from(userRoles)
      .where(
        inArray(
          userRoles.userId,
          rows.map((row) => row.id),
        ),
      )
      .orderBy(asc(userRoles.grantedAt), asc(userRoles.role));
    return rows.map((row) =>
      toUser(
        row,
        grants.filter((grant) => grant.userId === row.id),
      ),
    );
  };

  const findOne = async (rows: readonly UserRow[]): Promise<User | null> =>
    (await withRoles(rows))[0] ?? null;

  return {
    findById: async (id) => findOne(await db.select().from(users).where(eq(users.id, id))),

    // `email` is citext, so this matches regardless of case.
    findByEmail: async (email) =>
      findOne(await db.select().from(users).where(eq(users.email, email))),

    list: async () =>
      withRoles(await db.select().from(users).orderBy(asc(users.name), asc(users.id))),

    save: async (user) => {
      try {
        // A savepoint when `db` is already a transaction.
        await db.transaction((tx) => writeUser(tx, user));
      } catch (error) {
        if (isUniqueViolation(error, 'users_email_unique')) throw emailTaken();
        throw error;
      }
    },

    countActiveAdmins: async () => {
      const [row] = await db
        .select({ value: count() })
        .from(users)
        .innerJoin(userRoles, eq(userRoles.userId, users.id))
        .where(and(eq(users.isActive, true), eq(userRoles.role, 'admin')));
      return row?.value ?? 0;
    },
  };
};
