import { MeResponse } from '@feedback-portal/contracts';
import { queryOptions } from '@tanstack/react-query';
import { apiFetch } from './api-fetch.ts';
import { isApiError } from './errors.ts';

/** The signed-in user, or `null` when signed out (401), so guards can branch on it. */
export const meQuery = queryOptions({
  queryKey: ['me'],
  queryFn: async ({ signal }): Promise<MeResponse | null> => {
    try {
      return await apiFetch('/me', { schema: MeResponse, signal });
    } catch (error) {
      if (isApiError(error, 'unauthenticated')) return null;
      throw error;
    }
  },
  staleTime: 5 * 60_000,
});
