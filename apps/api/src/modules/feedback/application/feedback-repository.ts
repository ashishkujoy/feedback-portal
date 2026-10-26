import type { ColorCode } from '@feedback-portal/contracts';
import type { Intern } from '../../intern/domain/intern.ts';
import type { Feedback } from '../domain/feedback.ts';
import type { FeedbackId } from '../domain/feedback-id.ts';

/** Persistence for the `Feedback` aggregate. Only drafts are ever deleted (9.1 decision 1). */
export type FeedbackRepository = Readonly<{
  findById: (id: FeedbackId) => Promise<Feedback | null>;
  /** The same, locking the row until the transaction ends: one conversation delivers it (10.3). */
  findByIdForUpdate: (id: FeedbackId) => Promise<Feedback | null>;
  /**
   * Creates or updates the feedback and, when given, the intern it changed (colour, notice), in
   * one transaction: both are saved or neither is.
   */
  save: (feedback: Feedback, intern?: Intern) => Promise<void>;
  /**
   * The colour of the intern's newest submitted or delivered feedback that has one; `null` when
   * none has. The intern's colour follows it after an edit (9.8).
   */
  newestColour: (internId: string) => Promise<ColorCode | null>;
  /** Deletes a discarded draft. */

  deleteDraft: (id: FeedbackId) => Promise<void>;
}>;
