import type { ColorCode, InternDetail } from '@feedback-portal/contracts';
import { addMonths, formatDate } from '../batches/batch-dates.ts';
import { colourSummary, firstName } from './profile.ts';
import { type ColourKey, filterLabels } from './roster.ts';

// Spelled out rather than taken from Intl, as in batch-dates.ts.
const monthNames = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const firstOfMonth = (isoDate: string): string => `${isoDate.slice(0, 7)}-01`;

/** A period (`YYYY-MM-01`) as "October 2026". */
export const monthLabel = (period: string): string => {
  const [year = '', month = '1'] = period.split('-');
  return `${monthNames[Number(month) - 1] ?? ''} ${year}`;
};

export type MonthOption = Readonly<{ value: string; label: string }>;

/**
 * The months feedback can cover, as the API allows them (9.5 decision 3): today's month back to
 * the batch's start month, newest first. A batch that hasn't started gives only its first month,
 * which the API refuses until then (`notStarted`).
 */
export const feedbackMonths = (
  batchStartsOn: string,
  today: string,
): Readonly<{ options: readonly MonthOption[]; notStarted: boolean }> => {
  const earliest = firstOfMonth(batchStartsOn);
  const latest = firstOfMonth(today);
  if (latest < earliest) {
    return { options: [{ value: earliest, label: monthLabel(earliest) }], notStarted: true };
  }
  const options: MonthOption[] = [];
  for (let month = latest; month >= earliest; month = addMonths(month, -1)) {
    options.push({ value: month, label: monthLabel(month) });
  }
  return { options, notStarted: false };
};

/** v2 A7's colour list, in its order (No colour first), with its descriptions. */
export const colourOptions: readonly Readonly<{ key: ColourKey; description: string }>[] = [
  { key: 'none', description: 'Feedback only. Keeps the current code.' },
  { key: 'green', description: 'Doing excellent work.' },
  { key: 'yellow', description: 'Doing well. More effort would move to Green.' },
  { key: 'borderline_yellow', description: 'Doing well in places. Close to slipping to Orange.' },
  { key: 'orange', description: 'Not meeting expectations. Moves to Red without improvement.' },
  { key: 'borderline_red', description: 'Close to Red. Needs to improve now.' },
  { key: 'red', description: 'At risk. Notice can be given.' },
];

/** The line under the colour list. */
export const colourHelp = (current: ColorCode | null): string =>
  current === null
    ? `${colourSummary(null).label}. ${colourSummary(null).note}`
    : `Current code: ${filterLabels[current]}. No colour keeps it. Once a code is set it can’t go back to no colour.`;

/**
 * The notice switch's line: what submitting with notice does, or why it can't be given. The
 * notice starts on the day of submission (UTC) and lasts a month, as the API sets it.
 */
export const noticeDescription = (
  intern: Pick<InternDetail, 'name' | 'status' | 'noticeEndsOn'>,
  on: boolean,
  today: string,
  programManager: string,
): string => {
  if (intern.status === 'on_notice') {
    return intern.noticeEndsOn
      ? `${firstName(intern.name)} is already on notice until ${formatDate(intern.noticeEndsOn)}.`
      : `${firstName(intern.name)} is already on notice.`;
  }
  return on
    ? `Ends ${formatDate(addMonths(today, 1))}. ${programManager} then lifts it or terminates. Nothing happens automatically.`
    : 'Starts a one-month notice when you submit.';
};
