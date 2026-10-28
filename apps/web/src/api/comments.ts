import { type CommentParent, type CommentRequest, CommentView } from '@feedback-portal/contracts';
import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch, apiSend } from './api-fetch.ts';

const internPath = (batchId: string, internId: string) => `/batches/${batchId}/interns/${internId}`;

/** Every comment on an intern's feedback and conversations, oldest first (10.4). */
export const commentsQuery = (batchId: string, internId: string) =>
  queryOptions({
    queryKey: ['batches', batchId, 'interns', internId, 'comments'],
    queryFn: ({ signal }) =>
      apiFetch(`${internPath(batchId, internId)}/comments`, {
        schema: z.array(CommentView),
        signal,
      }),
  });

/** `POST …/feedback/:id/comments` or `POST …/conversations/:id/comments` (members of the batch). */
export const addComment = (
  batchId: string,
  internId: string,
  parent: CommentParent,
  body: CommentRequest,
) =>
  apiFetch(
    `${internPath(batchId, internId)}/${parent.kind === 'feedback' ? 'feedback' : 'conversations'}/${parent.id}/comments`,
    { method: 'POST', body, schema: CommentView },
  );

/** `PATCH …/comments/:id` (its author): changes the text. */
export const editComment = (
  batchId: string,
  internId: string,
  commentId: string,
  body: CommentRequest,
) =>
  apiFetch(`${internPath(batchId, internId)}/comments/${commentId}`, {
    method: 'PATCH',
    body,
    schema: CommentView,
  });

/** `DELETE …/comments/:id` (its author): clears the text; the comment stays as deleted. */
export const deleteComment = (batchId: string, internId: string, commentId: string) =>
  apiSend(`${internPath(batchId, internId)}/comments/${commentId}`, { method: 'DELETE' });
