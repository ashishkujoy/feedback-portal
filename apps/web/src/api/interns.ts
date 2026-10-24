import { type CreateInternRequest, InternSummary } from '@feedback-portal/contracts';
import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch } from './api-fetch.ts';

/** A batch's interns (anyone who can see the batch). 404 if it doesn't exist or isn't visible. */
export const internsQuery = (batchId: string) =>
  queryOptions({
    queryKey: ['batches', batchId, 'interns'],
    queryFn: ({ signal }) =>
      apiFetch(`/batches/${batchId}/interns`, { schema: z.array(InternSummary), signal }),
  });

/** `POST /batches/:id/interns` (the batch's managers): the new intern, or an `ApiError`. */
export const addIntern = (batchId: string, body: CreateInternRequest) =>
  apiFetch(`/batches/${batchId}/interns`, { method: 'POST', body, schema: InternSummary });
