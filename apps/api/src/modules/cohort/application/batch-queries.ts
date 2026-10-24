import type { InternCountsView } from './intern-counts.ts';
import type { BatchMemberRole } from '@feedback-portal/contracts';
import type { UserId } from '../../identity/domain/user-id.ts';
import type { BatchId } from '../domain/batch-id.ts';
import type { BatchMemberId } from '../domain/batch-member-id.ts';
import type { Viewer } from './batch-scope.ts';

export type PersonRef = Readonly<{ id: UserId; name: string; avatarUrl: string | null }>;

export type BatchSummaryView = Readonly<{
  id: BatchId;
  name: string;
  startDate: string;
  endDate: string;
  isArchived: boolean;
  programManager: PersonRef;
  /** Current mentors. */
  mentorCount: number;
  /** Current mentors, in the order they were assigned. */
  mentors: readonly PersonRef[];
  interns: InternCountsView;
}>;

export type BatchMemberView = Readonly<{
  id: BatchMemberId;
  user: PersonRef & Readonly<{ email: string; isActive: boolean }>;
  role: BatchMemberRole;
  assignedAt: Date;
  unassignedAt: Date | null;
}>;

export type BatchDetailView = BatchSummaryView & Readonly<{ members: readonly BatchMemberView[] }>;

/** Someone who can be ticked in Assign mentors; other batches by dates only, never names. */
export type MentorCandidateView = PersonRef &
  Readonly<{
    email: string;
    isActive: boolean;
    isAssigned: boolean;
    otherBatches: readonly Readonly<{ startDate: string; endDate: string }>[];
  }>;

/**
 * Read models for the batch screens: the aggregate holds ids, these add names and avatars. Both
 * are scoped to what `viewer` can see.
 */
export type BatchQueries = Readonly<{
  /** Active batches first, then newest start date, then name. */
  listSummaries: (viewer: Viewer) => Promise<readonly BatchSummaryView[]>;
  /** Members in the order they were assigned; `null` if unknown or not visible. */
  detail: (id: BatchId, viewer: Viewer) => Promise<BatchDetailView | null>;
  /**
   * Active users with the Mentor role, plus the batch's current mentors even if inactive, each
   * with the other current, unarchived batches they mentor. Callers check access first.
   */
  mentorCandidates: (id: BatchId) => Promise<readonly MentorCandidateView[]>;
}>;
