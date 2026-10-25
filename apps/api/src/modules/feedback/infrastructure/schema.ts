import { feedbackStates } from '@feedback-portal/contracts';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { colorCodeEnum } from '../../../shared/db/columns.ts';
import { users } from '../../identity/infrastructure/schema.ts';
import { interns } from '../../intern/infrastructure/schema.ts';

// Column names come from the camelCase keys via `casing: 'snake_case'`. No foreign key cascades.
// A trigger (migration 0005, hand-written) rejects deleting anything but a draft, and any update
// of delivered feedback: submitted feedback is never deleted, and delivered feedback never changes.

/** `draft` (its author only) → `submitted` → `delivered` (in a conversation). */
export const feedbackStateEnum = pgEnum('feedback_state', feedbackStates);

export const feedback = pgTable(
  'feedback',
  {
    id: uuid()
      .primaryKey()
      .default(sql`uuidv7()`),
    internId: uuid()
      .notNull()
      .references(() => interns.id),
    authorId: uuid()
      .notNull()
      .references(() => users.id),
    // The first day of the month the feedback covers.
    period: date({ mode: 'string' }).notNull(),
    // Markdown. May be blank while a draft.
    body: text().notNull(),
    // `NULL` leaves the intern's code unchanged.
    colorCode: colorCodeEnum(),
    // Submitting it puts the intern on notice for one month, in the same transaction.
    givesNotice: boolean().notNull().default(false),
    state: feedbackStateEnum().notNull().default('draft'),
    // The conversation that delivered it. Its foreign key comes with `conversations` (10.1).
    conversationId: uuid(),
    submittedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    // When its author last changed it after submitting (9.8); delivery doesn't count.
    editedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    index('feedback_intern_period_index').on(table.internId, table.period),
    // The latest coloured feedback, and the colour history.
    index('feedback_intern_colored_index')
      .on(table.internId, table.submittedAt)
      .where(sql`${table.colorCode} is not null`),
    // An author's own drafts.
    index('feedback_author_state_index').on(table.authorId, table.state),
    check('feedback_period_check', sql`extract(day from ${table.period}) = 1`),
    check(
      'feedback_submitted_check',
      sql`(${table.state} = 'draft') = (${table.submittedAt} is null)`,
    ),
    check(
      'feedback_delivered_check',
      sql`(${table.state} = 'delivered') = (${table.conversationId} is not null)`,
    ),
    check('feedback_edited_check', sql`${table.state} <> 'draft' or ${table.editedAt} is null`),
    // Some non-space character; Postgres' trim() only strips spaces, not tabs or newlines.
    check('feedback_body_check', sql`${table.state} = 'draft' or ${table.body} ~ '[^[:space:]]'`),
  ],
);
