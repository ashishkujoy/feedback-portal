import type { ColorCode } from '@feedback-portal/contracts';

type Person = Readonly<{ id: string; name: string; avatarUrl: string | null }>;
/** The storage's id for the photo; the HTTP layer turns it into a URL. */
type InternRef = Readonly<{ id: string; name: string; photoPublicId: string | null }>;

/**
 * v2 A24's batch overview (11.1): current interns (not terminated or withdrawn) by colour, who's
 * on notice and who issued it, and the feedback waiting to be delivered.
 */
export type BatchOverviewView = Readonly<{
  current: number;
  onNoticeCount: number;
  colours: Readonly<Record<ColorCode | 'none', number>>;
  /** Soonest ending first. */
  onNotice: readonly Readonly<{
    intern: InternRef;
    noticeStartsOn: string | null;
    noticeEndsOn: string;
    /** The actor of the latest change to On notice; `null` only if the history lacks it. */
    issuedBy: Person | null;
  }>[];
  /** Newest submitted first; only for interns whose record can still change. */
  toDeliver: readonly Readonly<{
    feedbackId: string;
    intern: InternRef;
    author: Person;
    submittedAt: Date;
    colorCode: ColorCode | null;
  }>[];
}>;
