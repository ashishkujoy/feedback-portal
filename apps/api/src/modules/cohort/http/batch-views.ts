import type { BatchDetail, BatchSummary, MentorCandidate } from '@feedback-portal/contracts';
import type {
  BatchDetailView,
  BatchSummaryView,
  MentorCandidateView,
} from '../application/batch-queries.ts';

export const toBatchSummary = (batch: BatchSummaryView): BatchSummary => ({
  id: batch.id,
  name: batch.name,
  startDate: batch.startDate,
  endDate: batch.endDate,
  isArchived: batch.isArchived,
  programManager: batch.programManager,
  mentorCount: batch.mentorCount,
  mentors: [...batch.mentors],
  interns: { ...batch.interns, colours: { ...batch.interns.colours } },
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

export const toMentorCandidate = (candidate: MentorCandidateView): MentorCandidate => ({
  id: candidate.id,
  name: candidate.name,
  email: candidate.email,
  avatarUrl: candidate.avatarUrl,
  isActive: candidate.isActive,
  isAssigned: candidate.isAssigned,
  otherBatches: candidate.otherBatches.map(({ startDate, endDate }) => ({ startDate, endDate })),
});
