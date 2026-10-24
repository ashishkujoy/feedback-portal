import type { BatchSummary, MeResponse } from '@feedback-portal/contracts';

/**
 * Whether `me` writes feedback in this batch: its PM or one of its current mentors, while it isn't
 * archived (9.3). An admin who isn't one of them doesn't. The API enforces the same; this only
 * decides what to show.
 */
export const canWriteFeedback = (
  me: MeResponse,
  batch: Pick<BatchSummary, 'isArchived' | 'programManager' | 'mentors'>,
): boolean =>
  !batch.isArchived &&
  (batch.programManager.id === me.id || batch.mentors.some((mentor) => mentor.id === me.id));
