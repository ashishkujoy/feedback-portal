import { type FeedbackContentRequest, FeedbackView } from '@feedback-portal/contracts';
import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch, apiSend } from './api-fetch.ts';

const feedbackPath = (batchId: string, internId: string) =>
  `/batches/${batchId}/interns/${internId}/feedback`;

/** An intern's feedback: the viewer's own drafts first, then the rest newest first (9.3). */
export const feedbackQuery = (batchId: string, internId: string) =>
  queryOptions({
    queryKey: ['batches', batchId, 'interns', internId, 'feedback'],
    queryFn: ({ signal }) =>
      apiFetch(feedbackPath(batchId, internId), { schema: z.array(FeedbackView), signal }),
  });

/**
 * `POST …/feedback` (the batch's PM and current mentors): a new draft, or with `submit: true` a
 * submitted entry. The entry, or an `ApiError`.
 */
export const createFeedback = (batchId: string, internId: string, body: FeedbackContentRequest) =>
  apiFetch(feedbackPath(batchId, internId), { method: 'POST', body, schema: FeedbackView });

/** `PUT …/feedback/:id` (the draft's author): replaces the draft, submitting it with `submit`. */
export const updateDraft = (
  batchId: string,
  internId: string,
  feedbackId: string,
  body: FeedbackContentRequest,
) =>
  apiFetch(`${feedbackPath(batchId, internId)}/${feedbackId}`, {
    method: 'PUT',
    body,
    schema: FeedbackView,
  });

/** `DELETE …/feedback/:id` (the draft's author): discards a draft; submitted feedback is kept. */
export const discardFeedback = (batchId: string, internId: string, feedbackId: string) =>
  apiSend(`${feedbackPath(batchId, internId)}/${feedbackId}`, { method: 'DELETE' });
