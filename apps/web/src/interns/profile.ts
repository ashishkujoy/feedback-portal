import type {
  ColorCode,
  InternDetail,
  InternStatus,
  InternStatusEvent,
} from '@feedback-portal/contracts';
import { daysBetween, formatDate, formatDay } from '../batches/batch-dates.ts';
import { filterLabels } from './roster.ts';

type BadgeType = 'info' | 'error' | 'success' | 'neutral';

/** The profile header's status badge (v2's STATUS map). */
export const statusBadges: Readonly<Record<InternStatus, { label: string; type: BadgeType }>> = {
  active: { label: 'Active', type: 'info' },
  on_notice: { label: 'On notice', type: 'error' },
  graduated: { label: 'Graduated', type: 'success' },
  terminated: { label: 'Terminated', type: 'neutral' },
  withdrawn: { label: 'Withdrawn', type: 'neutral' },
};

/** The first word of the name, for copy that would otherwise need a pronoun. */
export const firstName = (name: string): string => name.trim().split(/\s+/)[0] ?? name;

type Banner = Readonly<{ title: string; description: string }>;

/** The newest event that moved the intern to `status`. Events come newest first. */
const latestTo = (intern: InternDetail, status: InternStatus): InternStatusEvent | undefined =>
  intern.statusEvents.find((event) => event.toStatus === status);

/**
 * A6's notice banner while on notice. "with <colour> feedback" waits for Phase 9 (7.5 decision
 * 5); termination is always manual, so the PM is named as the one who decides.
 */
export const noticeBanner = (
  intern: InternDetail,
  today: string,
  programManager: string,
): Banner | null => {
  if (intern.status !== 'on_notice' || intern.noticeEndsOn === null) return null;
  const notice = latestTo(intern, 'on_notice');
  const left = daysBetween(today, intern.noticeEndsOn);
  const ends = formatDate(intern.noticeEndsOn);
  const issued = notice
    ? `Issued by ${notice.actor.name} on ${formatDate(notice.noticeStartsOn ?? notice.createdAt.slice(0, 10))}. `
    : '';
  return {
    title:
      left < 0
        ? `Notice ended on ${ends} · decision needed`
        : `On notice until ${ends} · ${left} ${left === 1 ? 'day' : 'days'} left`,
    description: `${issued}Nothing happens automatically when it ends: ${programManager}, the programme manager, lifts it or terminates.`,
  };
};

const finalVerbs = {
  graduated: 'graduated',
  terminated: 'was terminated',
  withdrawn: 'withdrew',
} as const;

/** A6-banners: one per final status, dated by the change that made it final. */
export const finalBanner = (intern: InternDetail): Banner | null => {
  if (
    intern.status !== 'graduated' &&
    intern.status !== 'terminated' &&
    intern.status !== 'withdrawn'
  ) {
    return null;
  }
  const change = latestTo(intern, intern.status);
  const on = change ? ` on ${formatDay(change.createdAt)}` : '';
  return {
    title: `This intern ${finalVerbs[intern.status]}${on}. Their record is read-only.`,
    description:
      'Feedback, conversations and comments stay visible. Nothing can be added or changed.',
  };
};

/** The side panel's "N of M days left", with the share still to run. */
export const noticePeriod = (
  intern: InternDetail,
  today: string,
): Readonly<{ label: string; share: number }> | null => {
  const notice = latestTo(intern, 'on_notice');
  if (intern.status !== 'on_notice' || !notice?.noticeStartsOn || !notice.noticeEndsOn) return null;
  const total = daysBetween(notice.noticeStartsOn, notice.noticeEndsOn);
  const left = Math.min(total, Math.max(0, daysBetween(today, notice.noticeEndsOn)));
  return { label: `${left} of ${total} days left`, share: total === 0 ? 0 : left / total };
};

/** Details' "Added": by hand with who, or imported from Airtable. */
export const addedText = (intern: InternDetail): string =>
  intern.source === 'airtable'
    ? `Imported from Airtable, ${formatDay(intern.createdAt)}`
    : `Added by ${intern.addedBy.name}, ${formatDay(intern.createdAt)}`;

/** A history row's reason; the onboarding event has none, so it says how the intern arrived. */
export const eventReason = (event: InternStatusEvent, source: InternDetail['source']): string =>
  event.reason ?? (source === 'airtable' ? 'Imported from Airtable.' : 'Added by hand.');

/** The side panel's colour code (7.5 decision 6). */
export const colourSummary = (code: ColorCode | null): Readonly<{ label: string; note: string }> =>
  code === null
    ? { label: 'No colour yet', note: 'Set by the first coloured feedback.' }
    : { label: filterLabels[code], note: 'From the latest coloured feedback.' };
