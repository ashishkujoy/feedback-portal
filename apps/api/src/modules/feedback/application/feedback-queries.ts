import type { ColorCode, FeedbackState } from '@feedback-portal/contracts';

/** One entry as its readers see it, with its author. */
export type FeedbackEntryView = Readonly<{
  id: string;
  internId: string;
  period: string;
  body: string;
  colorCode: ColorCode | null;
  previousColorCode: ColorCode | null;
  givesNotice: boolean;
  state: FeedbackState;
  author: Readonly<{ id: string; name: string; avatarUrl: string | null }>;
  conversationId: string | null;
  submittedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}>;

/** Read models for feedback. */
export type FeedbackQueries = Readonly<{
  /**
   * An intern's submitted and delivered feedback, plus `viewerId`'s own drafts (drafts are
   * visible to their author only). Drafts first, then the newest submitted.
   */
  listForIntern: (internId: string, viewerId: string) => Promise<readonly FeedbackEntryView[]>;
  /** One entry by id, whoever wrote it; callers check who may see it. */
  view: (id: string) => Promise<FeedbackEntryView | null>;
}>;
