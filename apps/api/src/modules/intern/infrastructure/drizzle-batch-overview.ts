import { and, asc, desc, eq, inArray, notInArray, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../../shared/db/client.ts';
import { feedback } from '../../feedback/infrastructure/schema.ts';
import { users } from '../../identity/infrastructure/schema.ts';
import type { BatchId } from '../../cohort/domain/batch-id.ts';
import type { BatchOverviewView } from '../application/batch-overview.ts';
import { internStatusEvents, interns } from './schema.ts';

type Colours = { -readonly [Code in keyof BatchOverviewView['colours']]: number };

const internRef = { id: interns.id, name: interns.name, photoPublicId: interns.photoPublicId };

/**
 * v2 A24's overview in three reads (11.1). Reads `feedback` and `users` for display only, as the
 * roster's queries read `users`; nothing here changes them.
 */
export const createBatchOverview =
  (db: DbExecutor) =>
  async (batchId: BatchId): Promise<BatchOverviewView> => {
    const inBatch = eq(interns.batchId, batchId);
    // "Excludes terminated and withdrawn."
    const current = and(inBatch, notInArray(interns.status, ['terminated', 'withdrawn']));
    const counted = await db
      .select({
        colorCode: interns.colorCode,
        total: sql<number>`count(*)`.mapWith(Number),
        onNotice: sql<number>`count(*) filter (where ${interns.status} = 'on_notice')`.mapWith(
          Number,
        ),
      })
      .from(interns)
      .where(current)
      .groupBy(interns.colorCode);
    const colours: Colours = {
      green: 0,
      yellow: 0,
      borderline_yellow: 0,
      orange: 0,
      borderline_red: 0,
      red: 0,
      none: 0,
    };
    for (const row of counted) colours[row.colorCode ?? 'none'] = row.total;

    // The latest change to On notice of each of the batch's interns: who issued the notice.
    const issued = db
      .selectDistinctOn([internStatusEvents.internId], {
        internId: internStatusEvents.internId,
        noticeStartsOn: internStatusEvents.noticeStartsOn,
        actorId: internStatusEvents.actorId,
      })
      .from(internStatusEvents)
      .where(
        and(
          eq(internStatusEvents.toStatus, 'on_notice'),
          inArray(
            internStatusEvents.internId,
            db.select({ id: interns.id }).from(interns).where(inBatch),
          ),
        ),
      )
      .orderBy(internStatusEvents.internId, desc(internStatusEvents.createdAt))
      .as('issued');
    const noticeRows = await db
      .select({
        intern: internRef,
        noticeEndsOn: interns.noticeEndsOn,
        noticeStartsOn: issued.noticeStartsOn,
        issuerId: users.id,
        issuerName: users.name,
        issuerAvatarUrl: users.avatarUrl,
      })
      .from(interns)
      .leftJoin(issued, eq(issued.internId, interns.id))
      .leftJoin(users, eq(users.id, issued.actorId))
      .where(and(inBatch, eq(interns.status, 'on_notice')))
      .orderBy(asc(interns.noticeEndsOn), sql`lower(${interns.name})`, asc(interns.id));

    const deliverRows = await db
      .select({
        feedbackId: feedback.id,
        intern: internRef,
        authorId: users.id,
        authorName: users.name,
        authorAvatarUrl: users.avatarUrl,
        submittedAt: feedback.submittedAt,
        colorCode: feedback.colorCode,
      })
      .from(feedback)
      .innerJoin(interns, eq(interns.id, feedback.internId))
      .innerJoin(users, eq(users.id, feedback.authorId))
      // A read-only intern's feedback can't be delivered any more, so it isn't waiting (10.2).
      .where(
        and(
          inBatch,
          eq(feedback.state, 'submitted'),
          inArray(interns.status, ['active', 'on_notice']),
        ),
      )
      .orderBy(desc(feedback.submittedAt), desc(feedback.id));

    return {
      current: counted.reduce((sum, row) => sum + row.total, 0),
      onNoticeCount: counted.reduce((sum, row) => sum + row.onNotice, 0),
      colours,
      onNotice: noticeRows.map((row) => {
        // The table's check: on notice exactly when there's an end date.
        if (!row.noticeEndsOn) throw new Error(`intern ${row.intern.id} on notice without an end`);
        return {
          intern: row.intern,
          noticeStartsOn: row.noticeStartsOn,
          noticeEndsOn: row.noticeEndsOn,
          issuedBy:
            row.issuerId && row.issuerName
              ? { id: row.issuerId, name: row.issuerName, avatarUrl: row.issuerAvatarUrl }
              : null,
        };
      }),
      toDeliver: deliverRows.map((row) => {
        // Submitted feedback always has its time (the feedback table's check).
        if (!row.submittedAt) throw new Error(`feedback ${row.feedbackId} has no submission`);
        return {
          feedbackId: row.feedbackId,
          intern: row.intern,
          author: { id: row.authorId, name: row.authorName, avatarUrl: row.authorAvatarUrl },
          submittedAt: row.submittedAt,
          colorCode: row.colorCode,
        };
      }),
    };
  };
