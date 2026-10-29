import type { MeResponse, MyPending } from '@feedback-portal/contracts';
import { daysBetween, formatDay, utcToday } from '../batches/batch-dates.ts';
import { monthLabel } from '../interns/feedback-form.ts';
import { dayAndMonth, shortPeriod } from '../interns/profile/feedback-entry.ts';
import type { TabItem } from '../ui/tabs.tsx';

export const pendingTabs = ['deliver', 'feedback', 'drafts'] as const;
export type PendingTab = (typeof pendingTabs)[number];

/** v2 shows the PM's page (To deliver first) to anyone holding the PM role (decision 2). */
export const isPmView = (me: MeResponse): boolean => me.roles.includes('program_manager');

/** The tabs for the role, with counts once loaded. */
export const tabItems = (me: MeResponse, pending: MyPending | undefined): TabItem<PendingTab>[] => [
  ...(isPmView(me)
    ? [{ value: 'deliver' as const, label: 'To deliver', count: pending?.toDeliver.length }]
    : []),
  { value: 'feedback', label: 'Needs feedback', count: pending?.needsFeedback.length },
  { value: 'drafts', label: 'Drafts', count: pending?.drafts.length },
];

/** The tab asked for, if the role has it; otherwise the role's first. */
export const shownTab = (me: MeResponse, asked: PendingTab | undefined): PendingTab => {
  const pm = isPmView(me);
  if (asked && (asked !== 'deliver' || pm)) return asked;
  return pm ? 'deliver' : 'feedback';
};

/** The sidebar's count: To deliver for a PM, Needs feedback for anyone else (decision 2). */
export const badgeCount = (me: MeResponse, pending: MyPending): number =>
  isPmView(me) ? pending.toDeliver.length : pending.needsFeedback.length;

export const subtitle = (me: MeResponse, month: string): string =>
  isPmView(me)
    ? 'Feedback waiting for you to deliver, and interns without feedback this month.'
    : `Interns in your batches with no feedback for ${monthLabel(month)}, and your drafts.`;

type LastFeedback = MyPending['needsFeedback'][number]['lastFeedback'];

/** "18 Sep 2026 · Sana Qureshi", "· you" for the viewer's own, or "No feedback yet". */
export const lastFeedbackLabel = (last: LastFeedback, meId: string): string =>
  last
    ? `${formatDay(last.submittedAt)} · ${last.author.id === meId ? 'you' : last.author.name}`
    : 'No feedback yet';

export const internCount = (count: number): string =>
  `${count} ${count === 1 ? 'intern' : 'interns'}`;

/** v2's draft line: "<batch> · period Oct 2026 · edited 23 Oct". */
export const draftLine = (draft: MyPending['drafts'][number]): string =>
  `${draft.batch.name} · period ${shortPeriod(draft.period)} · edited ${dayAndMonth(draft.updatedAt)}`;

/** v2's Waiting column: "today", "1 day", "5 days", in UTC days as 11.1 counts them. */
export const waitingFor = (submittedAt: string, now = new Date()): string => {
  const days = daysBetween(utcToday(new Date(submittedAt)), utcToday(now));
  if (days <= 0) return 'today';
  return `${days} ${days === 1 ? 'day' : 'days'}`;
};
