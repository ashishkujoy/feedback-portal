import {
  type ColorCode,
  type FeedbackView,
  type InternDetail,
  isFinalStatus,
} from '@feedback-portal/contracts';
import { daysBetween, today } from '../../batches/batch-dates.ts';

/** One coloured feedback: its id, its colour and when it was submitted (ISO date-time). */
export type ColourPoint = Readonly<{ id: string; code: ColorCode; at: string }>;

/**
 * The colours submitted feedback gave, oldest first. No-colour feedback is left out, and so are
 * drafts, which have no `submittedAt`.
 */
export const colourHistory = (entries: readonly FeedbackView[]): ColourPoint[] =>
  entries
    .flatMap((entry) =>
      entry.colorCode !== null && entry.submittedAt
        ? [{ id: entry.id, code: entry.colorCode, at: entry.submittedAt }]
        : [],
    )
    .toSorted((a, b) => a.at.localeCompare(b.at));

/**
 * Where the strip ends (9.7 decision 2): today, or the day the intern graduated, was terminated
 * or withdrew, so the last colour stops growing once the internship is over.
 */
export const historyEnd = (intern: InternDetail, on: string): string => {
  if (!isFinalStatus(intern.status)) return on;
  const change = intern.statusEvents.find((event) => event.toStatus === intern.status);
  return change ? today(new Date(change.createdAt)) : on;
};

/** A run of one colour: from which day (`YYYY-MM-DD`), and its share of the strip. */
export type StripSegment = Readonly<{ code: ColorCode | null; from: string; share: number }>;

/**
 * The strip: each colour as wide as the days it lasted between `start` and `end` (`YYYY-MM-DD`),
 * "No colour" until the first coloured feedback. Days are where the viewer is. Empty when the
 * range has no days, as before the batch starts.
 */
export const stripSegments = (
  history: readonly ColourPoint[],
  start: string,
  end: string,
): StripSegment[] => {
  const total = daysBetween(start, end);
  if (total <= 0) return [];
  const clamp = (day: string) => (day < start ? start : day > end ? end : day);
  const changes = [
    { code: null, from: start },
    ...history.map((point) => ({ code: point.code, from: clamp(today(new Date(point.at))) })),
  ];
  const segments: { code: ColorCode | null; from: string; days: number }[] = [];
  changes.forEach((change, index) => {
    const days = daysBetween(change.from, changes[index + 1]?.from ?? end);
    if (days <= 0) return;
    const last = segments.at(-1);
    if (last?.code === change.code) last.days += days;
    else segments.push({ code: change.code, from: change.from, days });
  });
  return segments.map(({ code, from, days }) => ({ code, from, share: days / total }));
};

/** The chart fits 4 columns in the side panel before the dates collide, as v2 draws (9.7 decision 3). */
export const maxColumns = 4;

/** The chart's columns: the latest `max` coloured feedback, and how many older ones are left out. */
export const chartColumns = (
  history: readonly ColourPoint[],
  max = maxColumns,
): Readonly<{ columns: ColourPoint[]; hidden: number }> => ({
  columns: history.slice(-max),
  hidden: Math.max(0, history.length - max),
});
