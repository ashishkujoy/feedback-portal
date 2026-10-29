import type { BatchOverview } from '@feedback-portal/contracts';
import { colourKeys, type ColourKey, filterLabels } from '../../interns/roster.ts';
import { daysBetween, utcToday } from '../batch-dates.ts';

export type DistributionRow = Readonly<{
  key: ColourKey;
  label: string;
  count: number;
  /** Share of current interns, for the bar's segment: "18.5%". */
  share: string;
  /** Against the largest count, for the row's bar: "100%". */
  relative: string;
  /** Rounded, as v2 shows it: "28%". */
  percent: string;
}>;

/** v2 A24's distribution rows, green to red then no colour. */
export const distributionRows = (overview: BatchOverview): DistributionRow[] => {
  const largest = Math.max(1, ...colourKeys.map((key) => overview.colours[key]));
  const total = Math.max(1, overview.current);
  return colourKeys.map((key) => {
    const count = overview.colours[key];
    return {
      key,
      label: filterLabels[key],
      count,
      share: `${((count / total) * 100).toFixed(1)}%`,
      relative: `${Math.round((count / largest) * 100)}%`,
      percent: `${Math.round((count / total) * 100)}%`,
    };
  });
};

/** "65 current interns, including 4 on notice. Excludes terminated and withdrawn." */
export const distributionNote = ({ current, onNoticeCount }: BatchOverview): string =>
  `${current} current ${current === 1 ? 'intern' : 'interns'}, including ${onNoticeCount} on notice. Excludes terminated and withdrawn.`;

export type NoticeLeft =
  | Readonly<{ kind: 'running'; label: string; urgent: boolean }>
  | Readonly<{ kind: 'ended' }>;

/**
 * "15 days left", urgent (red) at 7 or fewer, until the end day; after it, a decision is needed.
 * The same count as the profile's notice banner.
 */
export const noticeLeft = (endsOn: string, today: string): NoticeLeft => {
  const left = daysBetween(today, endsOn);
  if (left < 0) return { kind: 'ended' };
  return {
    kind: 'running',
    label: `${left} ${left === 1 ? 'day' : 'days'} left`,
    urgent: left <= 7,
  };
};

/** "waiting today", "waiting 1 day", "waiting 5 days": UTC days, as the API counts (decision 3). */
export const waitingLabel = (submittedAt: string, now = new Date()): string => {
  const days = daysBetween(utcToday(new Date(submittedAt)), utcToday(now));
  if (days <= 0) return 'waiting today';
  return `waiting ${days} ${days === 1 ? 'day' : 'days'}`;
};
