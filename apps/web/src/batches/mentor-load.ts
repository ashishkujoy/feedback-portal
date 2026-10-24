import type { MentorCandidate } from '@feedback-portal/contracts';
import { batchStatus } from './batch-status.ts';

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 'es'}`;

/**
 * A11's "load": how many other batches a mentor is on, by status. "2 active batches",
 * "1 active, 1 upcoming", "1 upcoming batch" or "Unassigned". Completed batches don't count.
 */
export const mentorLoad = (
  otherBatches: MentorCandidate['otherBatches'],
  todayIso: string,
): string => {
  const statuses = otherBatches.map((batch) =>
    batchStatus({ ...batch, isArchived: false }, todayIso),
  );
  const active = statuses.filter((status) => status === 'active').length;
  const upcoming = statuses.filter((status) => status === 'upcoming').length;
  if (active > 0 && upcoming > 0) return `${active} active, ${upcoming} upcoming`;
  if (active > 0) return count(active, 'active batch');
  if (upcoming > 0) return count(upcoming, 'upcoming batch');
  return 'Unassigned';
};
