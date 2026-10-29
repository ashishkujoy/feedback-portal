import type { ColorCode } from '@feedback-portal/contracts';

type Person = Readonly<{ id: string; name: string; avatarUrl: string | null }>;
/** The storage's id for the photo; the HTTP layer turns it into a URL. */
type InternRef = Readonly<{ id: string; name: string; photoPublicId: string | null }>;
type BatchRef = Readonly<{ id: string; name: string }>;

/**
 * v2 M26 / P26 (11.2): one user's open work across the batches they currently mentor or run,
 * started and not archived, for interns whose record can still change.
 */
export type PendingView = Readonly<{
  /** Interns without the user's submitted feedback for the month; by batch, then name. */
  needsFeedback: readonly Readonly<{
    intern: InternRef;
    batch: BatchRef;
    colorCode: ColorCode | null;
    /** The latest submitted feedback from anyone. */
    lastFeedback: Readonly<{ submittedAt: Date; author: Person }> | null;
  }>[];
  /** The user's drafts, the last edited first. */
  drafts: readonly Readonly<{
    feedbackId: string;
    intern: InternRef;
    batch: BatchRef;
    period: string;
    body: string;
    colorCode: ColorCode | null;
    updatedAt: Date;
  }>[];
  /** Undelivered feedback in the batches the user is the PM of; newest first. */
  toDeliver: readonly Readonly<{
    feedbackId: string;
    intern: InternRef;
    batch: BatchRef;
    author: Person;
    submittedAt: Date;
    colorCode: ColorCode | null;
  }>[];
}>;

export type PendingQueries = Readonly<{
  /** `month` is the period (`YYYY-MM-01`); `today` decides which batches have started. */
  forUser: (userId: string, on: Readonly<{ month: string; today: string }>) => Promise<PendingView>;
}>;
