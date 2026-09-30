import { z } from 'zod';

export const FeedbackState = z.enum(['draft', 'submitted', 'delivered']);
export type FeedbackState = z.infer<typeof FeedbackState>;
