import { MyPending } from '@feedback-portal/contracts';
import { queryOptions } from '@tanstack/react-query';
import { apiFetch } from './api-fetch.ts';

/**
 * v2 M26 / P26 (11.2): the signed-in user's open work. Every feedback change, conversation and
 * status change refreshes it by this exact key.
 */
export const pendingQuery = queryOptions({
  queryKey: ['pending'],
  queryFn: ({ signal }) => apiFetch('/me/pending', { schema: MyPending, signal }),
});
