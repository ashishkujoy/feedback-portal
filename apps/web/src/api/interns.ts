import { type CreateInternRequest, InternSummary } from '@feedback-portal/contracts';
import { apiFetch } from './api-fetch.ts';

/** `POST /batches/:id/interns` (the batch's managers): the new intern, or an `ApiError`. */
export const addIntern = (batchId: string, body: CreateInternRequest) =>
  apiFetch(`/batches/${batchId}/interns`, { method: 'POST', body, schema: InternSummary });
