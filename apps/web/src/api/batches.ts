import { BatchDetail, BatchSummary, type CreateBatchRequest } from '@feedback-portal/contracts';
import { queryOptions } from '@tanstack/react-query';
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
