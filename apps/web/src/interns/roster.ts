import {
  type ColorCode,
  colorCodes,
  type InternSummary,
  isFinalStatus,
} from '@feedback-portal/contracts';
import { z } from 'zod';
import { daysBetween } from '../batches/batch-dates.ts';

/** A colour cell of the summary: one of the six codes, or "No colour" for interns without one. */
export type ColourKey = ColorCode | 'none';
export const colourKeys: readonly ColourKey[] = [...colorCodes, 'none'];

/** The status cells of the summary, in v2's order. Active has no cell of its own. */
export const statusKeys = ['on_notice', 'terminated', 'withdrawn', 'graduated'] as const;
type StatusKey = (typeof statusKeys)[number];

/** The filter tags: All, then one per summary cell (7.4 decision 3: one at a time). */
export const RosterFilter = z.enum(['all', ...colourKeys, ...statusKeys]);
export type RosterFilter = z.infer<typeof RosterFilter>;

export const summaryKeys: readonly Exclude<RosterFilter, 'all'>[] = [...colourKeys, ...statusKeys];

export const filterLabels: Readonly<Record<RosterFilter, string>> = {
  all: 'All',
  green: 'Green',
  yellow: 'Yellow',
  borderline_yellow: 'Borderline Yellow',
  orange: 'Orange',
  borderline_red: 'Borderline Red',
  red: 'Red',
  none: 'No colour',
  on_notice: 'On notice',
  terminated: 'Terminated',
  withdrawn: 'Withdrawn',
  graduated: 'Graduated',
};

const isStatusKey = (filter: RosterFilter): filter is StatusKey =>
  (statusKeys as readonly string[]).includes(filter);

/** Whether `intern` belongs under `filter`. */
export const inFilter = (intern: InternSummary, filter: RosterFilter): boolean => {
  if (filter === 'all') return true;
  if (isStatusKey(filter)) return intern.status === filter;
  return (intern.colorCode ?? 'none') === filter;
};

/** Case-insensitive match on the username; a leading "@" and blanks are ignored. */
export const matchesUsername = (intern: InternSummary, search: string): boolean => {
  const needle = search.trim().replace(/^@/, '').toLowerCase();
  return needle === '' || intern.username.toLowerCase().includes(needle);
};

/** Each filter's size, as a lookup. They ignore the search, as the design's do. */
export const rosterCounts =
  (interns: readonly InternSummary[]) =>
  (filter: RosterFilter): number =>
    interns.filter((intern) => inFilter(intern, filter)).length;

const collator = new Intl.Collator(undefined, { sensitivity: 'base' });

/** By name as people read it: case and accents don't split the list. */
export const byName = (interns: readonly InternSummary[]): InternSummary[] =>
  interns.toSorted((a, b) => collator.compare(a.name, b.name) || a.id.localeCompare(b.id));

export type InternBadge = Readonly<{
  label: string;
  type: 'error' | 'warning' | 'success' | 'neutral';
}>;

const finalBadges = {
  graduated: { label: 'Graduated', type: 'success' },
  terminated: { label: 'Terminated', type: 'neutral' },
  withdrawn: { label: 'Withdrawn', type: 'neutral' },
} as const;

/**
 * The status badge under the name (A2): the days left of a notice, or "decision needed" once it
 * has ended (termination is always manual); the final statuses; nothing for Active.
 */
export const internBadge = (intern: InternSummary, today: string): InternBadge | null => {
  switch (intern.status) {
    case 'active':
      return null;
    case 'on_notice': {
      const left = intern.noticeEndsOn === null ? 0 : daysBetween(today, intern.noticeEndsOn);
      return left < 0
        ? { label: 'Notice ended · decision needed', type: 'warning' }
        : { label: `On notice · ${left} ${left === 1 ? 'day' : 'days'} left`, type: 'error' };
    }
    case 'graduated':
    case 'terminated':
    case 'withdrawn':
      return finalBadges[intern.status];
  }
};

/** Read-only: a final status, or any intern of an archived batch. */
export const isReadOnly = (intern: InternSummary, batch: Readonly<{ isArchived: boolean }>) =>
  batch.isArchived || isFinalStatus(intern.status);

export type RosterRow = Readonly<{
  intern: InternSummary;
  badge: InternBadge | null;
  readOnly: boolean;
}>;

/** What the roster shows: the interns under `filter` matching `search`, by name, with badges. */
export const rosterRows = (
  interns: readonly InternSummary[],
  {
    filter,
    search,
    batch,
    today,
  }: Readonly<{
    filter: RosterFilter;
    search: string;
    batch: { isArchived: boolean };
    today: string;
  }>,
): RosterRow[] =>
  byName(interns)
    .filter((intern) => inFilter(intern, filter) && matchesUsername(intern, search))
    .map((intern) => ({
      intern,
      badge: internBadge(intern, today),
      readOnly: isReadOnly(intern, batch),
    }));
