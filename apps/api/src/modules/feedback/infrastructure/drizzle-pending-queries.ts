import type { BatchMemberRole } from '@feedback-portal/contracts';
import { and, asc, desc, eq, inArray, isNull, lte, ne, notExists, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../../shared/db/client.ts';
import { batchMembers, batches } from '../../cohort/infrastructure/schema.ts';
import { users } from '../../identity/infrastructure/schema.ts';
import { interns } from '../../intern/infrastructure/schema.ts';
import type { PendingQueries } from '../application/pending-queries.ts';
import { feedback } from './schema.ts';

const internRef = { id: interns.id, name: interns.name, photoPublicId: interns.photoPublicId };
const batchRef = { id: batches.id, name: batches.name };

/** Only interns whose record can still change get feedback or have it delivered. */
const changeable = inArray(interns.status, ['active', 'on_notice']);

/**
 * v2 M26 / P26 in three reads (11.2). Reads the cohort, intern and identity tables to scope and
 * label the rows, as the other queries read `users`; nothing here changes them.
 */
export const createPendingQueries = (db: DbExecutor): PendingQueries => ({
  forUser: async (userId, { month, today }) => {
    // The batches the user currently holds one of `roles` in, started and not archived.
    const assigned = (roles: readonly BatchMemberRole[]) =>
      db
        .select({ id: batchMembers.batchId })
        .from(batchMembers)
        .innerJoin(batches, eq(batches.id, batchMembers.batchId))
        .where(
          and(
            eq(batchMembers.userId, userId),
            isNull(batchMembers.unassignedAt),
            inArray(batchMembers.role, roles),
            eq(batches.isArchived, false),
            lte(batches.startDate, today),
          ),
        );
    const inMine = inArray(interns.batchId, assigned(['mentor', 'program_manager']));

    // The latest submitted (or delivered) feedback of each intern in those batches, from anyone.
    const latest = db
      .selectDistinctOn([feedback.internId], {
        internId: feedback.internId,
        submittedAt: feedback.submittedAt,
        authorId: feedback.authorId,
      })
      .from(feedback)
      .where(
        and(
          ne(feedback.state, 'draft'),
          inArray(feedback.internId, db.select({ id: interns.id }).from(interns).where(inMine)),
        ),
      )
      .orderBy(feedback.internId, desc(feedback.submittedAt), desc(feedback.id))
      .as('latest');
    // Decision 1: only the user's own submitted feedback for the month clears an intern.
    const givenThisMonth = db
      .select({ one: sql`1` })
      .from(feedback)
      .where(
        and(
          eq(feedback.internId, interns.id),
          eq(feedback.authorId, userId),
          eq(feedback.period, month),
          ne(feedback.state, 'draft'),
        ),
      );
    const needRows = await db
      .select({
        intern: internRef,
        batch: batchRef,
        colorCode: interns.colorCode,
        submittedAt: latest.submittedAt,
        authorId: users.id,
        authorName: users.name,
        authorAvatarUrl: users.avatarUrl,
      })
      .from(interns)
      .innerJoin(batches, eq(batches.id, interns.batchId))
      .leftJoin(latest, eq(latest.internId, interns.id))
      .leftJoin(users, eq(users.id, latest.authorId))
      .where(and(inMine, changeable, notExists(givenThisMonth)))
      .orderBy(asc(batches.name), sql`lower(${interns.name})`, asc(interns.id));

    const drafts = await db
      .select({
        feedbackId: feedback.id,
        intern: internRef,
        batch: batchRef,
        period: feedback.period,
        body: feedback.body,
        colorCode: feedback.colorCode,
        updatedAt: feedback.updatedAt,
      })
      .from(feedback)
      .innerJoin(interns, eq(interns.id, feedback.internId))
      .innerJoin(batches, eq(batches.id, interns.batchId))
      .where(and(eq(feedback.authorId, userId), eq(feedback.state, 'draft'), inMine, changeable))
      .orderBy(desc(feedback.updatedAt), desc(feedback.id));

    const deliverRows = await db
      .select({
        feedbackId: feedback.id,
        intern: internRef,
        batch: batchRef,
        authorId: users.id,
        authorName: users.name,
        authorAvatarUrl: users.avatarUrl,
        submittedAt: feedback.submittedAt,
        colorCode: feedback.colorCode,
      })
      .from(feedback)
      .innerJoin(interns, eq(interns.id, feedback.internId))
      .innerJoin(batches, eq(batches.id, interns.batchId))
      .innerJoin(users, eq(users.id, feedback.authorId))
      .where(
        and(
          eq(feedback.state, 'submitted'),
          inArray(interns.batchId, assigned(['program_manager'])),
          changeable,
        ),
      )
      .orderBy(desc(feedback.submittedAt), desc(feedback.id));

    return {
      needsFeedback: needRows.map((row) => ({
        intern: row.intern,
        batch: row.batch,
        colorCode: row.colorCode,
        lastFeedback:
          row.submittedAt && row.authorId && row.authorName
            ? {
                submittedAt: row.submittedAt,
                author: { id: row.authorId, name: row.authorName, avatarUrl: row.authorAvatarUrl },
              }
            : null,
      })),
      drafts,
      toDeliver: deliverRows.map((row) => {
        // Submitted feedback always has its time (the feedback table's check).
        if (!row.submittedAt) throw new Error(`feedback ${row.feedbackId} has no submission`);
        return {
          feedbackId: row.feedbackId,
          intern: row.intern,
          batch: row.batch,
          author: { id: row.authorId, name: row.authorName, avatarUrl: row.authorAvatarUrl },
          submittedAt: row.submittedAt,
          colorCode: row.colorCode,
        };
      }),
    };
  },
});
