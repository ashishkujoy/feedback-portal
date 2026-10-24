import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../../shared/db/client.ts';
import { users } from '../../identity/infrastructure/schema.ts';
import type { InternQueries } from '../application/intern-queries.ts';
import { internStatusEvents, interns } from './schema.ts';

const summaryColumns = {
  id: interns.id,
  batchId: interns.batchId,
  username: interns.username,
  name: interns.name,
  email: interns.email,
  status: interns.status,
  colorCode: interns.colorCode,
  noticeEndsOn: interns.noticeEndsOn,
  photoPublicId: interns.photoPublicId,
};

// Display names only: like cohort's queries, these read `users` but never change it.
export const createInternQueries = (db: DbExecutor): InternQueries => ({
  listForBatch: (batchId) =>
    db
      .select(summaryColumns)
      .from(interns)
      .where(eq(interns.batchId, batchId))
      .orderBy(sql`lower(${interns.name})`, asc(interns.id)),

  detail: async (batchId, internId) => {
    const [row] = await db
      .select({
        ...summaryColumns,
        phone: interns.phone,
        diplomaBranch: interns.diplomaBranch,
        parentNames: interns.parentNames,
        interviewNotes: interns.interviewNotes,
        airtableRecordId: interns.airtableRecordId,
        createdAt: interns.createdAt,
      })
      .from(interns)
      .where(and(eq(interns.id, internId), eq(interns.batchId, batchId)));
    if (!row) return null;
    const events = await db
      .select({
        id: internStatusEvents.id,
        fromStatus: internStatusEvents.fromStatus,
        toStatus: internStatusEvents.toStatus,
        reason: internStatusEvents.reason,
        noticeStartsOn: internStatusEvents.noticeStartsOn,
        noticeEndsOn: internStatusEvents.noticeEndsOn,
        createdAt: internStatusEvents.createdAt,
        actorId: users.id,
        actorName: users.name,
      })
      .from(internStatusEvents)
      .innerJoin(users, eq(users.id, internStatusEvents.actorId))
      .where(eq(internStatusEvents.internId, internId))
      .orderBy(desc(internStatusEvents.createdAt), desc(internStatusEvents.id));
    const statusEvents = events.map((event) => ({
      id: event.id,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      reason: event.reason,
      noticeStartsOn: event.noticeStartsOn,
      noticeEndsOn: event.noticeEndsOn,
      createdAt: event.createdAt,
      actor: { id: event.actorId, name: event.actorName },
    }));
    // The onboarding event is the oldest; every intern has one (7.2).
    const onboarding = statusEvents.at(-1);
    if (!onboarding) throw new Error(`intern ${internId} has no onboarding event`);
    const { airtableRecordId, ...details } = row;
    return {
      ...details,
      source: airtableRecordId === null ? 'manual' : 'airtable',
      addedBy: onboarding.actor,
      statusEvents,
    };
  },
});
