import {
  BatchDetail,
  BatchSummary,
  type CreateBatchRequest,
  MentorCandidate,
} from '@feedback-portal/contracts';
import { type QueryClient, queryOptions } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch } from './api-fetch.ts';

/** The batches the signed-in user can see (all, for admins): active first, newest first. */
export const batchesQuery = queryOptions({
  queryKey: ['batches'],
  queryFn: ({ signal }) => apiFetch('/batches', { schema: z.array(BatchSummary), signal }),
});

/** One batch with its members, current and past. 404 if it doesn't exist or isn't visible. */
export const batchQuery = (id: string) =>
  queryOptions({
    queryKey: ['batches', id],
    queryFn: ({ signal }) => apiFetch(`/batches/${id}`, { schema: BatchDetail, signal }),
  });

/** `POST /batches` (admins): the new batch, or an `ApiError` (`batch_name_taken`, …). */
export const createBatch = (body: CreateBatchRequest) =>
  apiFetch('/batches', { method: 'POST', body, schema: BatchDetail });

/** Who Assign mentors lists (the batch's managers only). */
export const mentorCandidatesQuery = (id: string) =>
  queryOptions({
    queryKey: ['batches', id, 'mentor-candidates'],
    queryFn: ({ signal }) =>
      apiFetch(`/batches/${id}/mentor-candidates`, { schema: z.array(MentorCandidate), signal }),
  });

/** `PUT /batches/:id/mentors`: exactly these mentors, all or nothing. */
export const setMentors = (id: string, userIds: readonly string[]) =>
  apiFetch(`/batches/${id}/mentors`, { method: 'PUT', body: { userIds }, schema: BatchDetail });

/** "Remove" on the Mentors table: their assignment ends; the row stays as history. */
export const unassignMentor = (id: string, userId: string) =>
  apiFetch(`/batches/${id}/mentors/${userId}`, { method: 'DELETE', schema: BatchDetail });

/** After a change: show the API's answer for the batch, and refresh the list's counts. */
export const showUpdatedBatch = async (queryClient: QueryClient, batch: BatchDetail) => {
  queryClient.setQueryData(batchQuery(batch.id).queryKey, batch);
  await queryClient.invalidateQueries({ queryKey: batchesQuery.queryKey, exact: true });
};
