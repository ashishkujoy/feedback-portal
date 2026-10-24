import { z } from 'zod';
import { newId } from '../../../shared/ids.ts';

export const FeedbackId = z.uuid().brand<'FeedbackId'>();
export type FeedbackId = z.infer<typeof FeedbackId>;

export const newFeedbackId = (): FeedbackId => FeedbackId.parse(newId());
