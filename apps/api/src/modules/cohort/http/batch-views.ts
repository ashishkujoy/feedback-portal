import type { BatchDetail, BatchSummary } from '@feedback-portal/contracts';
import type { BatchDetailView, BatchSummaryView } from '../application/batch-queries.ts';

export const toBatchSummary = (batch: BatchSummaryView): BatchSummary => ({
  id: batch.id,
  name: batch.name,
  startDate: batch.startDate,
  endDate: batch.endDate,
  isArchived: batch.isArchived,
  programManager: batch.programManager,
  mentorCount: batch.mentorCount,
  mentors: [...batch.mentors],
});

export const toBatchDetail = (batch: BatchDetailView): BatchDetail => ({
  ...toBatchSummary(batch),
  members: batch.members.map((member) => ({
    id: member.id,
    user: member.user,
    role: member.role,
    assignedAt: member.assignedAt.toISOString(),
    unassignedAt: member.unassignedAt?.toISOString() ?? null,
  })),
});
