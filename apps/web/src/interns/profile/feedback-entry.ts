import type {
  ColorCode,
  CommentView,
  ConversationView,
  FeedbackView,
  InternStatusEvent,
} from '@feedback-portal/contracts';
import { formatDate, formatDay, today } from '../../batches/batch-dates.ts';

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

/** "10 Oct" for a calendar date (`YYYY-MM-DD`), as v2's "Delivered 10 Oct". */
export const shortDay = (isoDate: string): string => formatDate(isoDate).replace(/ \d+$/, '');

/** v2's state badge: "Awaiting delivery" until a conversation delivers it, then "Delivered 10 Oct". */
export const stateBadge = (
  entry: Pick<FeedbackView, 'state' | 'deliveredOn'>,
): Readonly<{ type: 'info' | 'success'; label: string }> => {
  if (entry.state !== 'delivered') return { type: 'info', label: 'Awaiting delivery' };
  return {
    type: 'success',
    label: entry.deliveredOn ? `Delivered ${shortDay(entry.deliveredOn)}` : 'Delivered',
  };
};

/** "Anjali Deshpande’s feedback (8 Oct)": what a conversation delivered, as v2 links it. */
export const deliveredLabel = (conversation: Pick<ConversationView, 'feedback'>): string =>
  `${conversation.feedback.author.name}’s feedback (${dayAndMonth(conversation.feedback.submittedAt)})`;

/**
 * One timeline entry: feedback (or a draft), a conversation (10.3 decision 2), a comment (10.5
 * decision 1), or a status change (10.6).
 */
export type TimelineEntry =
  | Readonly<{ kind: 'feedback'; id: string; entry: FeedbackView }>
  | Readonly<{ kind: 'conversation'; id: string; conversation: ConversationView }>
  | Readonly<{ kind: 'comment'; id: string; comment: CommentView }>
  | Readonly<{ kind: 'status'; id: string; event: InternStatusEvent }>;

type Keyed = Readonly<{ item: TimelineEntry; day: string; rank: number; time: string }>;

/** Status changes for the timeline: onboarding ("→ Active") stays in Status history (10.6 decision 1). */
export const statusChanges = (events: readonly InternStatusEvent[]): InternStatusEvent[] =>
  events.filter((event) => event.fromStatus !== null);

/**
 * The viewer's drafts first (9.6), then everything else newest first: by day where the viewer is
 * (a conversation's is the day it was held), then on the same day a comment, a status change, a
 * conversation, then feedback (each follows what comes after it in that list), then the newest
 * moment.
 */
export const timelineEntries = (
  feedback: readonly FeedbackView[],
  conversations: readonly ConversationView[],
  comments: readonly CommentView[],
  events: readonly InternStatusEvent[],
): TimelineEntry[] => {
  const drafts = feedback.filter((entry) => entry.state === 'draft');
  const dated: Keyed[] = [
    ...feedback
      .filter((entry) => entry.state !== 'draft')
      .map((entry): Keyed => {
        const at = entry.submittedAt ?? entry.updatedAt;
        return {
          item: { kind: 'feedback', id: entry.id, entry },
          day: today(new Date(at)),
          rank: 3,
          time: at,
        };
      }),
    ...conversations.map((conversation): Keyed => ({
      item: { kind: 'conversation', id: conversation.id, conversation },
      day: conversation.heldOn,
      rank: 2,
      time: conversation.createdAt,
    })),
    ...statusChanges(events).map((event): Keyed => ({
      item: { kind: 'status', id: event.id, event },
      day: today(new Date(event.createdAt)),
      rank: 1,
      time: event.createdAt,
    })),
    ...comments.map((comment): Keyed => ({
      item: { kind: 'comment', id: comment.id, comment },
      day: today(new Date(comment.createdAt)),
      rank: 0,
      time: comment.createdAt,
    })),
  ];
  const sorted = dated.toSorted(
    (a, b) => b.day.localeCompare(a.day) || a.rank - b.rank || b.time.localeCompare(a.time),
  );
  return [
    ...drafts.map((entry): TimelineEntry => ({ kind: 'feedback', id: entry.id, entry })),
    ...sorted.map(({ item }) => item),
  ];
};

/**
 * The note under a status change: its reason, as Status history shows it, and when it starts a
 * notice " Runs until 8 Nov 2026." (10.6 decision 2).
 */
export const statusNote = (event: InternStatusEvent): string => {
  const reason = event.reason ?? '';
  if (event.toStatus !== 'on_notice' || !event.noticeEndsOn) return reason;
  return `${reason} Runs until ${formatDate(event.noticeEndsOn)}.`.trim();
};

/** v2's "Show earlier activity": entries per page (10.6 decision 3). Drafts aren't counted. */
export const pageSize = 10;

/** The first `pages` pages of entries (drafts always), and how many are still hidden. */
export const shownEntries = (
  entries: readonly TimelineEntry[],
  pages: number,
): Readonly<{ shown: readonly TimelineEntry[]; hidden: number }> => {
  const drafts = entries.filter((item) => item.kind === 'feedback' && item.entry.state === 'draft');
  const shown = entries.slice(0, drafts.length + pages * pageSize);
  return { shown, hidden: entries.length - shown.length };
};

/** How many pages show the entry `id` (10.6 decision 4); at least `pages`. */
export const pagesShowing = (
  entries: readonly TimelineEntry[],
  id: string,
  pages: number,
): number => {
  const drafts = entries.filter((item) => item.kind === 'feedback' && item.entry.state === 'draft');
  const index = entries.findIndex((item) => item.id === id) - drafts.length;
  return index < 0 ? pages : Math.max(pages, Math.floor(index / pageSize) + 1);
};

/** How many comments each feedback entry or conversation has, deleted ones included. */
export const commentCounts = (comments: readonly CommentView[]): ReadonlyMap<string, number> => {
  const counts = new Map<string, number>();
  for (const { parent } of comments) counts.set(parent.id, (counts.get(parent.id) ?? 0) + 1);
  return counts;
};

/**
 * The card's note: "No comments", or where they are. A comment always follows what it's on, so on
 * the newest-first timeline it sits above the card (10.5 decision 2; v2 writes "below").
 */
export const commentNote = (count: number): string => {
  if (count === 0) return 'No comments';
  return `${count} ${count === 1 ? 'comment' : 'comments'} above`;
};

/** "Rajesh Menon’s conversation (10 Oct)": a conversation, as a comment links to it. */
export const conversationLabel = (
  conversation: Pick<ConversationView, 'recordedBy' | 'heldOn'>,
): string => `${conversation.recordedBy.name}’s conversation (${shortDay(conversation.heldOn)})`;

/** "Vikram Shetty’s feedback (22 Oct)": feedback, as a comment or a conversation links to it. */
export const feedbackLabel = (entry: Pick<FeedbackView, 'author' | 'submittedAt'>): string =>
  `${entry.author.name}’s feedback (${entry.submittedAt ? dayAndMonth(entry.submittedAt) : ''})`;

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
