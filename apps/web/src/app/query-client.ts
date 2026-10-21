import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/errors.ts';

/** 4xx answers (401, 403, 404, 409…) won't change by asking again; anything else gets one retry. */
export const shouldRetry = (failureCount: number, error: unknown): boolean =>
  !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failureCount < 1;

/** One per app (and per test). */
export const createQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      // Moving between pages shouldn't refetch everything at once.
      queries: { staleTime: 30_000, retry: shouldRetry },
    },
  });
