import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { DbExecutor } from '../../../shared/db/client.ts';
import { UserId } from '../../identity/domain/user-id.ts';
import { users } from '../../identity/infrastructure/schema.ts';
import type {
  BatchDetailView,
  BatchMemberView,
  BatchQueries,
  BatchSummaryView,
} from '../application/batch-queries.ts';
import { BatchId } from '../domain/batch-id.ts';
import { BatchMemberId } from '../domain/batch-member-id.ts';
import { visibleBatchCondition } from './batch-visibility.ts';
import { batches, batchMembers } from './schema.ts';

type BatchRow = typeof batches.$inferSelect;

const memberColumns = {
  id: batchMembers.id,
  batchId: batchMembers.batchId,
  role: batchMembers.role,
  assignedAt: batchMembers.assignedAt,
  unassignedAt: batchMembers.unassignedAt,
  userId: users.id,
  name: users.name,
  email: users.email,
  avatarUrl: users.avatarUrl,
  isActive: users.isActive,
};

type MemberRow = Readonly<{
  id: string;
  batchId: string;
  role: BatchMemberView['role'];
  assignedAt: Date;
  unassignedAt: Date | null;
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  isActive: boolean;
}>;

const toMemberView = (row: MemberRow): BatchMemberView => ({
  id: BatchMemberId.parse(row.id),
  user: {
    id: UserId.parse(row.userId),
    name: row.name,
    email: row.email,
    avatarUrl: row.avatarUrl,
    isActive: row.isActive,
  },
  role: row.role,
  assignedAt: row.assignedAt,
  unassignedAt: row.unassignedAt,
});

/** Builds a summary from the batch's current members. Every batch has a PM (6.2). */
const toSummary = (row: BatchRow, current: readonly BatchMemberView[]): BatchSummaryView => {
  const pm = current.find((member) => member.role === 'program_manager');
  if (!pm) throw new Error(`batch ${row.id} has no current programme manager`);
  const mentors = current.filter((member) => member.role === 'mentor');
  return {
    id: BatchId.parse(row.id),
    name: row.name,
    startDate: row.startDate,
    endDate: row.endDate,
    isArchived: row.isArchived,
    programManager: { id: pm.user.id, name: pm.user.name, avatarUrl: pm.user.avatarUrl },
    mentorCount: mentors.length,
    mentors: mentors.map(({ user }) => ({
      id: user.id,
      name: user.name,
      avatarUrl: user.avatarUrl,
    })),
  };
};

export const createBatchQueries = (db: DbExecutor): BatchQueries => {
  const membersWithUsers = () =>
    db.select(memberColumns).from(batchMembers).innerJoin(users, eq(users.id, batchMembers.userId));

  return {
    listSummaries: async (viewer) => {
      const rows = await db
        .select()
        .from(batches)
        .where(visibleBatchCondition(viewer, batches.id))
        .orderBy(asc(batches.isArchived), desc(batches.startDate), asc(batches.name));
      if (rows.length === 0) return [];
      // Current members of the listed batches in one query; batches number in the tens.
      const current = (
        await membersWithUsers()
          .where(
            and(
              isNull(batchMembers.unassignedAt),
              inArray(
                batchMembers.batchId,
                rows.map((row) => row.id),
              ),
            ),
          )
          .orderBy(asc(batchMembers.assignedAt), asc(batchMembers.id))
      ).map((member) => ({ batchId: member.batchId, view: toMemberView(member) }));
      return rows.map((row) =>
        toSummary(
          row,
          current.filter((member) => member.batchId === row.id).map((member) => member.view),
        ),
      );
    },

    detail: async (id, viewer): Promise<BatchDetailView | null> => {
      const [row] = await db
        .select()
        .from(batches)
        .where(and(eq(batches.id, id), visibleBatchCondition(viewer, batches.id)));
      if (!row) return null;
      const members = (
        await membersWithUsers()
          .where(eq(batchMembers.batchId, id))
          .orderBy(asc(batchMembers.assignedAt), asc(batchMembers.id))
      ).map(toMemberView);
      const current = members.filter((member) => member.unassignedAt === null);
      return { ...toSummary(row, current), members };
    },
  };
};
