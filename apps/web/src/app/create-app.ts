import type { QueryClient } from '@tanstack/react-query';
import type { RouterHistory } from '@tanstack/react-router';
import { meQuery } from '../api/me.ts';
import { createQueryClient } from './query-client.ts';
import { createAppRouter } from './router.tsx';

/**
 * The query client and router, wired together: a 401 anywhere (the session ended mid-use) marks
 * the user signed out and goes to sign-in. `history` defaults to the browser's.
 */
export const createApp = ({ history }: Readonly<{ history?: RouterHistory }> = {}) => {
  // `router` is assigned before any query can run, so the hook can use it.
  let router: ReturnType<typeof createAppRouter> | undefined;
  const queryClient: QueryClient = createQueryClient({
    onUnauthenticated: () => {
      queryClient.setQueryData(meQuery.queryKey, null);
      void router?.navigate({ to: '/login' });
    },
  });
  router = createAppRouter({ queryClient, ...(history ? { history } : {}) });
  return { queryClient, router };
};
