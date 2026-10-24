import {
  type ChangeStatusRequest,
  type CreateInternRequest,
  InternDetail,
  InternSummary,
  PhotoUploadTicket,
  type SetPhotoRequest,
} from '@feedback-portal/contracts';
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

/** One intern's profile (anyone who can see the batch). 404 for another batch's intern. */
export const internQuery = (batchId: string, internId: string) =>
  queryOptions({
    queryKey: ['batches', batchId, 'interns', internId],
    queryFn: ({ signal }) =>
      apiFetch(`/batches/${batchId}/interns/${internId}`, { schema: InternDetail, signal }),
  });

/** `POST /batches/:id/interns` (the batch's managers): the new intern, or an `ApiError`. */
export const addIntern = (batchId: string, body: CreateInternRequest) =>
  apiFetch(`/batches/${batchId}/interns`, { method: 'POST', body, schema: InternSummary });

/** `POST …/status-changes` (the batch's PM): the updated profile, or an `ApiError`. */
export const changeStatus = (batchId: string, internId: string, body: ChangeStatusRequest) =>
  apiFetch(`/batches/${batchId}/interns/${internId}/status-changes`, {
    method: 'POST',
    body,
    schema: InternDetail,
  });

/** `POST …/photo-upload` (the batch's managers): a signed ticket for one upload. */
export const photoUploadTicket = (batchId: string, internId: string) =>
  apiFetch(`/batches/${batchId}/interns/${internId}/photo-upload`, {
    method: 'POST',
    schema: PhotoUploadTicket,
  });

/** `PUT …/photo`: save the uploaded photo; the updated profile, or an `ApiError`. */
export const setPhoto = (batchId: string, internId: string, body: SetPhotoRequest) =>
  apiFetch(`/batches/${batchId}/interns/${internId}/photo`, {
    method: 'PUT',
    body,
    schema: InternDetail,
  });
