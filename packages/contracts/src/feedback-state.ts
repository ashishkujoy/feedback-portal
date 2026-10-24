import { z } from 'zod';

/**
 * Tuple form, for consumers that need the literal list (e.g. the Postgres enum). Feedback moves
 * one way: a draft only its author sees, then submitted, then delivered in a conversation.
 */
export const feedbackStates = ['draft', 'submitted', 'delivered'] as const;

export const FeedbackState = z.enum(feedbackStates);
export type FeedbackState = z.infer<typeof FeedbackState>;
