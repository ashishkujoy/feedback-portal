import { QueryClient } from '@tanstack/react-query';

/** One per app (and per test). The retry policy for API errors arrives with the API client. */
export const createQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      // Moving between pages shouldn't refetch everything at once.
      queries: { staleTime: 30_000 },
    },
  });
