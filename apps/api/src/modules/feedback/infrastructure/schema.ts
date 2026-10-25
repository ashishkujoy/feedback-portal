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
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { colorCodeEnum } from '../../../shared/db/columns.ts';
import { users } from '../../identity/infrastructure/schema.ts';
import { interns } from '../../intern/infrastructure/schema.ts';

// Column names come from the camelCase keys via `casing: 'snake_case'`. No foreign key cascades.
// A trigger (migration 0005, hand-written) rejects deleting anything but a draft, and any update
// of delivered feedback: submitted feedback is never deleted, and delivered feedback never changes.
// Two more (migration 0009) refuse deleting a conversation or a comment, and changing a comment
// once it was deleted.

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
    // The conversation that delivered it; one conversation delivers one feedback (10.1).
    conversationId: uuid().references((): AnyPgColumn => conversations.id),
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
    // One conversation delivers one feedback (10.1 decision 1).
    uniqueIndex('feedback_conversation_unique').on(table.conversationId),
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

/**
 * The one-on-one in which the PM delivers one feedback entry (v2 A8). Its notes and date can be
 * changed later (`edited_at`); it is never deleted (a trigger refuses), so delivered feedback
 * always keeps its conversation.
 */
export const conversations = pgTable(
  'conversations',
  {
    id: uuid()
      .primaryKey()
      .default(sql`uuidv7()`),
    internId: uuid()
      .notNull()
      .references(() => interns.id),
    // The PM, shown as "Delivered by".
    recordedBy: uuid()
      .notNull()
      .references(() => users.id),
    // "Date delivered": a calendar date.
    heldOn: date({ mode: 'string' }).notNull(),
    // Markdown, required.
    notes: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    // When the notes or date were changed after recording.
    editedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    // The intern's timeline (10.6).
    index('conversations_intern_held_index').on(table.internId, table.heldOn),
    check('conversations_notes_check', sql`${table.notes} ~ '[^[:space:]]'`),
  ],
);

/**
 * A flat thread on either a feedback entry or a conversation. Deleting is soft: the text is
 * cleared and `deleted_at` set ("This comment was deleted."); a trigger refuses hard deletes and
 * any change once deleted.
 */
export const comments = pgTable(
  'comments',
  {
    id: uuid()
      .primaryKey()
      .default(sql`uuidv7()`),
    feedbackId: uuid().references(() => feedback.id),
    conversationId: uuid().references(() => conversations.id),
    authorId: uuid()
      .notNull()
      .references(() => users.id),
    body: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    editedAt: timestamp({ withTimezone: true }),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    index('comments_feedback_index')
      .on(table.feedbackId, table.createdAt)
      .where(sql`${table.feedbackId} is not null`),
    index('comments_conversation_index')
      .on(table.conversationId, table.createdAt)
      .where(sql`${table.conversationId} is not null`),
    // Exactly one parent (the roadmap's one-parent check).
    check(
      'comments_parent_check',
      sql`num_nonnulls(${table.feedbackId}, ${table.conversationId}) = 1`,
    ),
    check(
      'comments_body_check',
      sql`${table.deletedAt} is not null or ${table.body} ~ '[^[:space:]]'`,
    ),
  ],
);
