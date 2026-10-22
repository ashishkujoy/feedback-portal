import { QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { render } from '@testing-library/react';
import { createApp } from '../app/create-app.ts';

/** The real router, shell and Query, on a memory history starting at `path`. Stub the API first. */
export const renderApp = (path: string) => {
  const history = createMemoryHistory({ initialEntries: [path] });
  const { queryClient, router } = createApp({ history });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, history, queryClient };
};
