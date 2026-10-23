import { batchMemberRoles } from '@feedback-portal/contracts';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { citext } from '../../../shared/db/columns.ts';
import { users } from '../../identity/infrastructure/schema.ts';

// Column names come from the camelCase keys via `casing: 'snake_case'`. No foreign key cascades:
// batches are archived and users deactivated, never deleted, so a delete fails instead of
// erasing history.

/** A member's role in one batch; values come from the shared contracts enum. */
export const batchMemberRoleEnum = pgEnum('batch_member_role', batchMemberRoles);

export const batches = pgTable(
  'batches',
  {
    id: uuid()
      .primaryKey()
      .default(sql`uuidv7()`),
    // citext: "Batch 1" and "batch 1" can't both exist.
    name: citext().notNull().unique(),
    startDate: date({ mode: 'string' }).notNull(),
    // The expected graduation date (about start + 18 months).
    endDate: date({ mode: 'string' }).notNull(),
    // An archived batch is read-only (enforced by the domain).
    isArchived: boolean().notNull().default(false),
    createdBy: uuid()
      .notNull()
      .references(() => users.id),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [check('batches_dates_check', sql`${table.endDate} > ${table.startDate}`)],
);

/**
 * Assignment history: rows are never deleted, and unassigning sets `unassigned_at`. A row with
 * `unassigned_at IS NULL` is a current assignment.
 */
export const batchMembers = pgTable(
  'batch_members',
  {
    id: uuid()
      .primaryKey()
      .default(sql`uuidv7()`),
    batchId: uuid()
      .notNull()
      .references(() => batches.id),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    role: batchMemberRoleEnum().notNull(),
    assignedBy: uuid()
      .notNull()
      .references(() => users.id),
    assignedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    unassignedAt: timestamp({ withTimezone: true }),
    unassignedBy: uuid().references(() => users.id),
  },
  (table) => [
    // One current PM per batch; one person may still run several batches.
    uniqueIndex('batch_members_one_pm_unique')
      .on(table.batchId)
      .where(sql`${table.role} = 'program_manager' and ${table.unassignedAt} is null`),
    // No duplicate current assignments; history may repeat once the earlier one has ended.
    uniqueIndex('batch_members_current_unique')
      .on(table.batchId, table.userId, table.role)
      .where(sql`${table.unassignedAt} is null`),
    // "My batches": every batch-scoped query filters on the viewer's current assignments (6.4).
    index('batch_members_current_user_index')
      .on(table.userId)
      .where(sql`${table.unassignedAt} is null`),
    // Every unassignment records who did it.
    check(
      'batch_members_unassigned_check',
      sql`(${table.unassignedAt} is null) = (${table.unassignedBy} is null)`,
    ),
    check(
      'batch_members_unassigned_after_check',
      sql`${table.unassignedAt} is null or ${table.unassignedAt} >= ${table.assignedAt}`,
    ),
  ],
);
