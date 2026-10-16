import { roles } from '@feedback-portal/contracts';
import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { citext } from '../../../shared/db/columns.ts';

// Column names come from the camelCase keys via `casing: 'snake_case'` (drizzle.config.ts and
// the client), e.g. `googleSub` → `google_sub`.

/** Global roles; values come from the shared contracts enum. */
export const roleEnum = pgEnum('role', roles);

const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();

export const users = pgTable('users', {
  // The app normally supplies `newId()`; the default covers rows inserted by hand.
  id: uuid()
    .primaryKey()
    .default(sql`uuidv7()`),
  // citext: unique regardless of case, even for rows written outside the app.
  email: citext().notNull().unique(),
  name: text().notNull(),
  // Set on first Google sign-in.
  googleSub: text().unique('users_google_sub_unique'),
  avatarUrl: text(),
  // Users are deactivated, never deleted, so their feedback stays attributable.
  isActive: boolean().notNull().default(true),
  lastLoginAt: timestamp({ withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: roleEnum().notNull(),
    // NULL: granted by the system (the bootstrap admin seed).
    grantedBy: uuid().references(() => users.id),
    grantedAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.role] })],
);

export const sessions = pgTable(
  'sessions',
  {
    // SHA-256 (hex) of the session token; the raw token only ever lives in the cookie.
    id: text().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    userAgent: text(),
    ip: text(),
    createdAt: createdAt(),
  },
  (table) => [index().on(table.userId), index().on(table.expiresAt)],
);
