import type { BatchSummary } from '@feedback-portal/contracts';
import { dateRange, formatDate } from './batch-dates.ts';

export type BatchStatus = 'upcoming' | 'active' | 'completed' | 'archived';

/** From the dates and today (`YYYY-MM-DD`); the end date itself still counts as active. */
export const batchStatus = (
  batch: Pick<BatchSummary, 'startDate' | 'endDate' | 'isArchived'>,
  todayIso: string,
): BatchStatus => {
  if (batch.isArchived) return 'archived';
  if (todayIso < batch.startDate) return 'upcoming';
  return todayIso <= batch.endDate ? 'active' : 'completed';
};

/** The design's badges: Active `info`, Upcoming `neutral`, Completed `success`. */
export const statusBadges = {
  upcoming: { label: 'Upcoming', type: 'neutral' },
  active: { label: 'Active', type: 'info' },
  completed: { label: 'Completed', type: 'success' },
  archived: { label: 'Archived', type: 'neutral' },
} as const satisfies Record<BatchStatus, { label: string; type: string }>;

/** "Starts 11 Jan 2027" before it starts, otherwise the range. */
export const batchDates = (
  batch: Pick<BatchSummary, 'startDate' | 'endDate'>,
  status: BatchStatus,
): string =>
  status === 'upcoming'
    ? `Starts ${formatDate(batch.startDate)}`
    : dateRange(batch.startDate, batch.endDate);

const listOrder: Readonly<Record<BatchStatus, number>> = {
  active: 0,
  upcoming: 1,
  completed: 2,
  archived: 3,
};

/**
 * The design's order: active, then upcoming, then completed, then archived. Within each, the
 * API's order (newest start first) is kept.
 */
export const inListOrder = <T extends Pick<BatchSummary, 'startDate' | 'endDate' | 'isArchived'>>(
  batches: readonly T[],
  todayIso: string,
): T[] =>
  batches.toSorted(
    (a, b) => listOrder[batchStatus(a, todayIso)] - listOrder[batchStatus(b, todayIso)],
  );
