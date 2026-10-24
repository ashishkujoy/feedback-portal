import { colorCodes, internStatuses } from '@feedback-portal/contracts';
import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { citext } from '../../../shared/db/columns.ts';
import { batches } from '../../cohort/infrastructure/schema.ts';
import { users } from '../../identity/infrastructure/schema.ts';

// Column names come from the camelCase keys via `casing: 'snake_case'`. No foreign key cascades:
// interns and their history are never deleted, so a delete fails instead of erasing it.

/** Where an intern stands in the program; values come from the shared contracts enum. */
export const internStatusEnum = pgEnum('intern_status', internStatuses);

/** How an intern is performing; `NULL` means "no colour code yet". */
export const colorCodeEnum = pgEnum('color_code', colorCodes);

export const interns = pgTable(
  'interns',
  {
    id: uuid()
      .primaryKey()
      .default(sql`uuidv7()`),
    // An intern belongs to exactly one batch.
    batchId: uuid()
      .notNull()
      .references(() => batches.id),
    // The Airtable record the intern was last imported from.
    airtableRecordId: text(),
    // citext: unique within the batch regardless of case; re-imports match on it.
    username: citext().notNull(),
    name: text().notNull(),
    email: text().notNull(),
    phone: text(),
    diplomaBranch: text(),
    parentNames: text(),
    // Markdown.
    interviewNotes: text(),
    // A raw snapshot of the Airtable record, for fields not modelled here.
    airtableFields: jsonb(),
    // Cloudinary `public_id`.
    photoPublicId: text(),
    // Denormalized: the source of truth is `intern_status_events`.
    status: internStatusEnum().notNull().default('active'),
    // Denormalized: the latest submitted feedback with a code (Phase 9).
    colorCode: colorCodeEnum(),
    noticeEndsOn: date({ mode: 'string' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('interns_batch_username_unique').on(table.batchId, table.username),
    index('interns_batch_status_index').on(table.batchId, table.status),
    check(
      'interns_notice_check',
      sql`(${table.status} = 'on_notice') = (${table.noticeEndsOn} is not null)`,
    ),
    check('interns_email_lower_check', sql`${table.email} = lower(${table.email})`),
    check(
      'interns_names_check',
      // Some non-space character; Postgres' trim() only strips spaces, not tabs or newlines.
      sql`${table.username} ~ '[^[:space:]]' and ${table.name} ~ '[^[:space:]]'`,
    ),
  ],
);

/**
 * Every status change, append-only (a trigger rejects UPDATE and DELETE). The first event of an
 * intern is the onboarding one: `from_status` NULL, `to_status` 'active', no reason needed.
 */
export const internStatusEvents = pgTable(
  'intern_status_events',
  {
    id: uuid()
      .primaryKey()
      .default(sql`uuidv7()`),
    internId: uuid()
      .notNull()
      .references(() => interns.id),
    fromStatus: internStatusEnum(),
    toStatus: internStatusEnum().notNull(),
    // Markdown. Required for every change except onboarding.
    reason: text(),
    noticeStartsOn: date({ mode: 'string' }),
    noticeEndsOn: date({ mode: 'string' }),
    // The feedback marked as notice that started it. Its foreign key comes with `feedback` (9.1).
    feedbackId: uuid(),
    actorId: uuid()
      .notNull()
      .references(() => users.id),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('intern_status_events_intern_index').on(table.internId, table.createdAt),
    check(
      'intern_status_events_change_check',
      sql`${table.fromStatus} is distinct from ${table.toStatus}`,
    ),
    check(
      'intern_status_events_onboarding_check',
      sql`${table.fromStatus} is not null or ${table.toStatus} = 'active'`,
    ),
    check(
      'intern_status_events_reason_check',
      sql`${table.fromStatus} is null or coalesce(${table.reason}, '') ~ '[^[:space:]]'`,
    ),
    // Both dates are tested for NULL first: a comparison with NULL is NULL, which a CHECK passes.
    check(
      'intern_status_events_notice_check',
      sql`case when ${table.toStatus} = 'on_notice'
        then ${table.noticeStartsOn} is not null and ${table.noticeEndsOn} is not null
          and ${table.noticeEndsOn} > ${table.noticeStartsOn}
        else ${table.noticeStartsOn} is null and ${table.noticeEndsOn} is null end`,
    ),
  ],
);

/** How an Airtable import run ended; `pending` while it runs. */
export const importStatusEnum = pgEnum('import_status', ['pending', 'completed', 'failed']);

/**
 * One row per Airtable import run (8.4). The token is never stored. `errors` holds the invalid
 * rows (row, username, reasons), never field values; `failure_reason` says why a run failed.
 */
export const airtableImports = pgTable(
  'airtable_imports',
  {
    id: uuid()
      .primaryKey()
      .default(sql`uuidv7()`),
    batchId: uuid()
      .notNull()
      .references(() => batches.id),
    baseId: text().notNull(),
    tableId: text().notNull(),
    // What was typed: the view's name or its `viw…` id.
    view: text().notNull(),
    status: importStatusEnum().notNull().default('pending'),
    recordCount: integer().notNull().default(0),
    createdCount: integer().notNull().default(0),
    updatedCount: integer().notNull().default(0),
    skippedCount: integer().notNull().default(0),
    errors: jsonb(),
    failureReason: text(),
    importedBy: uuid()
      .notNull()
      .references(() => users.id),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    index('airtable_imports_batch_index').on(table.batchId, table.createdAt),
    check(
      'airtable_imports_counts_check',
      sql`${table.recordCount} >= 0 and ${table.createdCount} >= 0 and ${table.updatedCount} >= 0 and ${table.skippedCount} >= 0`,
    ),
    check(
      'airtable_imports_completed_check',
      sql`(${table.status} = 'pending') = (${table.completedAt} is null)`,
    ),
    check(
      'airtable_imports_failure_check',
      sql`(${table.status} = 'failed') = (${table.failureReason} is not null)`,
    ),
  ],
);
