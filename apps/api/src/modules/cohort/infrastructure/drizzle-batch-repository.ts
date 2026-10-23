import { asc, eq, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../../shared/db/client.ts';
import { isUniqueViolation } from '../../../shared/db/pg-error.ts';
import { conflict } from '../../../shared/errors/app-error.ts';
import { UserId } from '../../identity/domain/user-id.ts';
import type { BatchRepository } from '../application/batch-repository.ts';
import type { Batch, BatchMember } from '../domain/batch.ts';
import { BatchId } from '../domain/batch-id.ts';
import { BatchMemberId } from '../domain/batch-member-id.ts';
import { batches, batchMembers } from './schema.ts';

type BatchRow = typeof batches.$inferSelect;
type MemberRow = typeof batchMembers.$inferSelect;

// Parsing (rather than casting) gives loaded values their brands; a row that doesn't parse is a
// bug or a hand-edited row and surfaces as a 500.
const toMember = (row: MemberRow): BatchMember => ({
  id: BatchMemberId.parse(row.id),
  userId: UserId.parse(row.userId),
  role: row.role,
  assignedBy: UserId.parse(row.assignedBy),
  assignedAt: row.assignedAt,
  unassignedAt: row.unassignedAt,
  unassignedBy: row.unassignedBy === null ? null : UserId.parse(row.unassignedBy),
});

const toBatch = (row: BatchRow, members: readonly MemberRow[]): Batch => ({
  id: BatchId.parse(row.id),
  name: row.name,
  startDate: row.startDate,
  endDate: row.endDate,
  isArchived: row.isArchived,
  createdBy: UserId.parse(row.createdBy),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  members: members.map(toMember),
});

const writeBatch = async (tx: DbExecutor, batch: Batch): Promise<void> => {
  const { members, ...columns } = batch;
  await tx
    .insert(batches)
    .values(columns)
    .onConflictDoUpdate({
      target: batches.id,
      set: { name: batch.name, isArchived: batch.isArchived, updatedAt: batch.updatedAt },
    });
  if (members.length === 0) return;
  // New assignments are inserted; existing ones can only have ended.
  await tx
    .insert(batchMembers)
    .values(
      members.map((member) => ({
        id: member.id,
        batchId: batch.id,
        userId: member.userId,
        role: member.role,
        assignedBy: member.assignedBy,
        assignedAt: member.assignedAt,
        unassignedAt: member.unassignedAt,
        unassignedBy: member.unassignedBy,
      })),
    )
    .onConflictDoUpdate({
      target: batchMembers.id,
      set: {
        unassignedAt: sql`excluded.unassigned_at`,
        unassignedBy: sql`excluded.unassigned_by`,
      },
    });
};

const batchNameTaken = () => conflict('A batch with this name already exists', 'batch_name_taken');

export const createBatchRepository = (db: DbExecutor): BatchRepository => ({
  findById: async (id) => {
    const [row] = await db.select().from(batches).where(eq(batches.id, id));
    if (!row) return null;
    const members = await db
      .select()
      .from(batchMembers)
      .where(eq(batchMembers.batchId, id))
      .orderBy(asc(batchMembers.assignedAt), asc(batchMembers.id));
    return toBatch(row, members);
  },

  save: async (batch) => {
    try {
      // A savepoint when `db` is already a transaction.
      await db.transaction((tx) => writeBatch(tx, batch));
    } catch (error) {
      if (isUniqueViolation(error, 'batches_name_unique')) throw batchNameTaken();
      throw error;
    }
  },
});
