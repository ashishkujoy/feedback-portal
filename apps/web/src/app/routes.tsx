import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, createRoute, redirect } from '@tanstack/react-router';
import { BatchesPage } from '../pages/batches-page.tsx';
import { NotFoundPage } from '../pages/not-found-page.tsx';
import { UsersPage } from '../pages/users-page.tsx';
import { AppShell } from '../shell/app-shell.tsx';

export type RouterContext = Readonly<{ queryClient: QueryClient }>;

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    /** This route's breadcrumb label; routes without one add no crumb. */
    crumb?: string;
  }
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: AppShell,
  notFoundComponent: NotFoundPage,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => redirect({ to: '/batches', throw: true }),
});

const batchesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/batches',
  staticData: { crumb: 'Batches' },
  component: BatchesPage,
});

const usersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/users',
  staticData: { crumb: 'Users and roles' },
  component: UsersPage,
});

export const routeTree = rootRoute.addChildren([indexRoute, batchesRoute, usersRoute]);
