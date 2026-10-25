import type { ColorCode, FeedbackView } from '@feedback-portal/contracts';
import { formatDay } from '../../batches/batch-dates.ts';

const shortMonths = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** A period (`YYYY-MM-01`) as v2's "Oct 2026". */
export const shortPeriod = (period: string): string => {
  const [year = '', month = '1'] = period.split('-');
  return `${shortMonths[Number(month) - 1] ?? ''} ${year}`;
};

/** A moment as its day and month where the viewer is: "23 Oct" (v2's draft line). */
export const dayAndMonth = (isoDateTime: string): string => {
  const date = new Date(isoDateTime);
  return `${date.getDate()} ${shortMonths[date.getMonth()] ?? ''}`;
};

/**
 * "gave feedback · 22 Oct 2026 · period Oct 2026", after the author's name, with " · edited" once
 * its author changed it (9.8), as v2 marks edited comments.
 */
export const feedbackLine = (
  entry: Pick<FeedbackView, 'submittedAt' | 'period' | 'editedAt'>,
): string =>
  `gave feedback · ${entry.submittedAt ? formatDay(entry.submittedAt) : ''} · period ${shortPeriod(entry.period)}${entry.editedAt ? ' · edited' : ''}`;

/** Its author changes submitted feedback until it's delivered (9.8). */
export const isEditableBy = (
  entry: Pick<FeedbackView, 'state' | 'author'>,
  viewerId: string,
): boolean => entry.state === 'submitted' && entry.author.id === viewerId;

export type ColourChange =
  | Readonly<{ kind: 'changed'; from: ColorCode; to: ColorCode }>
  | Readonly<{ kind: 'first'; to: ColorCode }>
  /** No colour, or the same colour as before (9.6 decision 2): "Colour code unchanged". */
  | Readonly<{ kind: 'unchanged'; code: ColorCode | null }>;

/** What submitted feedback did to the intern's colour, from the snapshot taken on submission. */
export const colourChange = (
  entry: Pick<FeedbackView, 'colorCode' | 'previousColorCode'>,
): ColourChange => {
  const { colorCode: to, previousColorCode: from } = entry;
  if (to === null || to === from) return { kind: 'unchanged', code: to };
  return from === null ? { kind: 'first', to } : { kind: 'changed', from, to };
};

/** v2's state badge: "Awaiting delivery" until a conversation delivers it (Phase 10). */
export const stateBadge = (
  entry: Pick<FeedbackView, 'state'>,
): Readonly<{ type: 'info' | 'success'; label: string }> =>
  entry.state === 'delivered'
    ? { type: 'success', label: 'Delivered' }
    : { type: 'info', label: 'Awaiting delivery' };

const excerptLength = 160;

/** A draft's text as one plain line, Markdown marks dropped, cut at a word with "…". */
export const excerpt = (body: string): string => {
  const plain = body
    .replace(/^\s{0,3}(#{1,6}\s+|[-*+]\s+|\d+\.\s+|>\s?)/gm, '')
    .replace(/[*_`~]/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length <= excerptLength) return plain;
  const cut = plain.slice(0, excerptLength);
  const space = cut.lastIndexOf(' ');
  return `${(space > excerptLength / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
};

/** When the intern's colour was set: the newest submitted feedback with a colour (v2's side panel). */
export const latestColouredOn = (entries: readonly FeedbackView[]): string | null => {
  const latest = entries
    .filter((entry) => entry.state !== 'draft' && entry.colorCode !== null && entry.submittedAt)
    .toSorted((a, b) => (b.submittedAt ?? '').localeCompare(a.submittedAt ?? ''))[0];
  return latest?.submittedAt ? formatDay(latest.submittedAt) : null;
};
