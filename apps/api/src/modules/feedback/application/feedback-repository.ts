import type { Intern } from '../../intern/domain/intern.ts';
import type { Feedback } from '../domain/feedback.ts';
import type { FeedbackId } from '../domain/feedback-id.ts';

/** Persistence for the `Feedback` aggregate. Only drafts are ever deleted (9.1 decision 1). */
export type FeedbackRepository = Readonly<{
  findById: (id: FeedbackId) => Promise<Feedback | null>;
  /**
   * Creates or updates the feedback and, when given, the intern it changed (colour, notice), in
   * one transaction: both are saved or neither is.
   */
  save: (feedback: Feedback, intern?: Intern) => Promise<void>;
  /** Deletes a discarded draft. */
  deleteDraft: (id: FeedbackId) => Promise<void>;
}>;
