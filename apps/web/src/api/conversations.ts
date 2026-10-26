import {
  type ConversationContentRequest,
  ConversationView,
  type RecordConversationRequest,
} from '@feedback-portal/contracts';
import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch } from './api-fetch.ts';

const conversationsPath = (batchId: string, internId: string) =>
  `/batches/${batchId}/interns/${internId}/conversations`;

/** An intern's conversations, newest held first (10.3). */
export const conversationsQuery = (batchId: string, internId: string) =>
  queryOptions({
    queryKey: ['batches', batchId, 'interns', internId, 'conversations'],
    queryFn: ({ signal }) =>
      apiFetch(conversationsPath(batchId, internId), {
        schema: z.array(ConversationView),
        signal,
      }),
  });

/** `POST …/conversations` (the batch's PM): records it, delivering the chosen feedback. */
export const recordConversation = (
  batchId: string,
  internId: string,
  body: RecordConversationRequest,
) =>
  apiFetch(conversationsPath(batchId, internId), {
    method: 'POST',
    body,
    schema: ConversationView,
  });

/** `PATCH …/conversations/:id` (the batch's PM): changes the notes and date. */
export const editConversation = (
  batchId: string,
  internId: string,
  conversationId: string,
  body: ConversationContentRequest,
) =>
  apiFetch(`${conversationsPath(batchId, internId)}/${conversationId}`, {
    method: 'PATCH',
    body,
    schema: ConversationView,
  });
