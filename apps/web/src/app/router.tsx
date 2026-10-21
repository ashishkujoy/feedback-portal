import { createRouter, type RouterHistory } from '@tanstack/react-router';
import { type RouterContext, routeTree } from './routes.tsx';

/** `history` defaults to the browser's; tests pass a memory history. */
export const createAppRouter = ({
  queryClient,
  history,
}: RouterContext & Readonly<{ history?: RouterHistory }>) =>
  createRouter({
    routeTree,
    context: { queryClient },
    ...(history ? { history } : {}),
    defaultPreload: 'intent',
    scrollRestoration: true,
  });

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
