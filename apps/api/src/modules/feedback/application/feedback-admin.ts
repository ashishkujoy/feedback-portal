import type { BatchAccess } from '../../intern/application/batch-access.ts';
import type { InternRepository } from '../../intern/application/intern-repository.ts';
import type { ConversationQueries } from './conversation-queries.ts';
import type { ConversationRepository } from './conversation-repository.ts';
import type { FeedbackQueries } from './feedback-queries.ts';
import type { FeedbackRepository } from './feedback-repository.ts';

/** What a feedback change may touch, bound to one transaction. */
export type FeedbackScope = Readonly<{
  feedback: FeedbackRepository;
  queries: FeedbackQueries;
  conversations: ConversationRepository;
  conversationQueries: ConversationQueries;
  interns: InternRepository;
  batchAccess: BatchAccess;
}>;

/** Runs `work` in one transaction; throwing rolls it back. */
export type FeedbackTransaction = <T>(work: (scope: FeedbackScope) => Promise<T>) => Promise<T>;
