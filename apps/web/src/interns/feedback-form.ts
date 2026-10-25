import type { ColorCode, FeedbackView, InternDetail } from '@feedback-portal/contracts';
import { addMonths, formatDate, formatDay } from '../batches/batch-dates.ts';
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

/** The colour help when editing (9.8): the intern's code follows the newest coloured feedback. */
export const editColourHelp = (current: ColorCode | null): string =>
  `${current === null ? 'No colour yet' : `Current code: ${filterLabels[current]}`}. The code follows the newest coloured feedback, so changing an older one leaves it.`;

type NoticeSwitch = Readonly<{ description: string; disabled: boolean }>;

type EditedIntern = Pick<InternDetail, 'name' | 'status' | 'noticeEndsOn' | 'statusEvents'>;

/**
 * The notice switch when editing submitted feedback (9.8). Feedback that gave notice can withdraw
 * it only while that notice runs; otherwise the switch stays on and says why (decision 2).
 * Feedback without notice can give one, as when submitting, from the day it's saved.
 */
export const editNoticeSwitch = (
  intern: EditedIntern,
  entry: Pick<FeedbackView, 'id' | 'givesNotice'>,
  on: boolean,
  today: string,
  programManager: string,
): NoticeSwitch => {
  if (!entry.givesNotice) {
    if (intern.status === 'on_notice') {
      return { description: noticeDescription(intern, on, today, programManager), disabled: true };
    }
    return {
      description: on
        ? `Ends ${formatDate(addMonths(today, 1))}. ${programManager} then lifts it or terminates. Nothing happens automatically.`
        : 'Starts a one-month notice when you save.',
      disabled: false,
    };
  }
  // Events are newest first: the one just before the notice's own is what came after it.
  const events = intern.statusEvents;
  const given = events.findIndex(
    (event) => event.toStatus === 'on_notice' && event.feedbackId === entry.id,
  );
  const running = intern.status === 'on_notice' && given === 0;
  if (running) {
    return {
      description: on
        ? `Runs until ${intern.noticeEndsOn ? formatDate(intern.noticeEndsOn) : 'its end'}. Switching it off withdraws it.`
        : 'Saving withdraws the notice this feedback gave.',
      disabled: false,
    };
  }
  const next = given > 0 ? events[given - 1] : undefined;
  let description = "This notice is no longer running, so it can't be withdrawn here.";
  if (next?.toStatus === 'active') {
    description = `This notice was lifted on ${formatDay(next.createdAt)}, so it can't be withdrawn here.`;
  } else if (next?.toStatus === 'on_notice') {
    description = 'A later notice replaced this one.';
  }
  return { description, disabled: true };
};
