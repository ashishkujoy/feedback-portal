import { asc, eq } from 'drizzle-orm';
import type { DbExecutor } from '../../../shared/db/client.ts';
import { isUniqueViolation } from '../../../shared/db/pg-error.ts';
import { conflict } from '../../../shared/errors/app-error.ts';
import { BatchId } from '../../cohort/domain/batch-id.ts';
import { UserId } from '../../identity/domain/user-id.ts';
import type { InternRepository } from '../application/intern-repository.ts';
import type { Intern, StatusEvent } from '../domain/intern.ts';
import { InternId } from '../domain/intern-id.ts';
import { StatusEventId } from '../domain/status-event-id.ts';
import { internStatusEvents, interns } from './schema.ts';

type InternRow = typeof interns.$inferSelect;
type EventRow = typeof internStatusEvents.$inferSelect;

// Parsing (rather than casting) gives loaded values their brands; a row that doesn't parse is a
// bug or a hand-edited row and surfaces as a 500.
const toEvent = (row: EventRow): StatusEvent => ({
  id: StatusEventId.parse(row.id),
  fromStatus: row.fromStatus,
  toStatus: row.toStatus,
  reason: row.reason,
  noticeStartsOn: row.noticeStartsOn,
  noticeEndsOn: row.noticeEndsOn,
  feedbackId: row.feedbackId,
  actorId: UserId.parse(row.actorId),
  createdAt: row.createdAt,
});

const airtableFieldsOf = (value: unknown): Intern['airtableFields'] =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;

const toIntern = (row: InternRow, events: readonly EventRow[]): Intern => ({
  id: InternId.parse(row.id),
  batchId: BatchId.parse(row.batchId),
  username: row.username,
  name: row.name,
  email: row.email,
  phone: row.phone,
  diplomaBranch: row.diplomaBranch,
  parentNames: row.parentNames,
  interviewNotes: row.interviewNotes,
  airtableRecordId: row.airtableRecordId,
  airtableFields: airtableFieldsOf(row.airtableFields),
  photoPublicId: row.photoPublicId,
  status: row.status,
  colorCode: row.colorCode,
  noticeEndsOn: row.noticeEndsOn,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  statusEvents: events.map(toEvent),
});

const writeIntern = async (tx: DbExecutor, intern: Intern): Promise<void> => {
  const { statusEvents, id, batchId, createdAt, ...changeable } = intern;
  await tx
    .insert(interns)
    .values({ id, batchId, createdAt, ...changeable })
    .onConflictDoUpdate({ target: interns.id, set: changeable });
  // Events are append-only (a trigger rejects updates): the ones already saved are skipped.
  await tx
    .insert(internStatusEvents)
    .values(
      statusEvents.map((event) => ({
        id: event.id,
        internId: id,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        reason: event.reason,
        noticeStartsOn: event.noticeStartsOn,
        noticeEndsOn: event.noticeEndsOn,
        feedbackId: event.feedbackId,
        actorId: event.actorId,
        createdAt: event.createdAt,
      })),
    )
    .onConflictDoNothing({ target: internStatusEvents.id });
};

const usernameTaken = () =>
  conflict('An intern with this username is already in the batch', 'intern_username_taken');

export const createInternRepository = (db: DbExecutor): InternRepository => {
  const load = async (id: InternId, lock: boolean): Promise<Intern | null> => {
    const query = db.select().from(interns).where(eq(interns.id, id));
    const [row] = await (lock ? query.for('update') : query);
    if (!row) return null;
    const events = await db
      .select()
      .from(internStatusEvents)
      .where(eq(internStatusEvents.internId, id))
      .orderBy(asc(internStatusEvents.createdAt), asc(internStatusEvents.id));
    return toIntern(row, events);
  };

  return {
    findById: (id) => load(id, false),
    findByIdForUpdate: (id) => load(id, true),

    save: async (intern) => {
      try {
        // A savepoint when `db` is already a transaction.
        await db.transaction((tx) => writeIntern(tx, intern));
      } catch (error) {
        if (isUniqueViolation(error, 'interns_batch_username_unique')) throw usernameTaken();
        throw error;
      }
    },
  };
};
