import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiError, isApiError } from '../api/errors.ts';

/** 4xx answers (401, 403, 404, 409…) won't change by asking again; anything else gets one retry. */
export const shouldRetry = (failureCount: number, error: unknown): boolean =>
  !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failureCount < 1;

type QueryClientOptions = Readonly<{
  /** Called when any query or mutation gets a 401: the session ended mid-use. */
  onUnauthenticated?: () => void;
}>;

/** One per app (and per test). */
export const createQueryClient = ({ onUnauthenticated }: QueryClientOptions = {}): QueryClient => {
  const onError = (error: unknown) => {
    if (isApiError(error, 'unauthenticated')) onUnauthenticated?.();
  };
  return new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      // Moving between pages shouldn't refetch everything at once.
      queries: { staleTime: 30_000, retry: shouldRetry },
    },
  });
};
