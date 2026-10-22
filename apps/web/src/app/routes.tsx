import type { MeResponse } from '@feedback-portal/contracts';
import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, createRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';
import { meQuery } from '../api/me.ts';
import { settingsQuery } from '../api/settings.ts';
import { RootLayout } from '../branding/root-layout.tsx';
import { batchesLabel, isAdmin } from '../identity/roles.ts';
import { BatchesPage } from '../pages/batches-page.tsx';
import { LoginPage } from '../pages/login-page.tsx';
import { NotFoundPage } from '../pages/not-found-page.tsx';
import { UsersPage } from '../pages/users-page.tsx';
import { AppShell } from '../shell/app-shell.tsx';

export type RouterContext = Readonly<{ queryClient: QueryClient }>;

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    /** This route's breadcrumb label (or one that depends on the user); none adds no crumb. */
    crumb?: string | ((me: MeResponse) => string);
  }
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  // Load the names before the first page renders, so they don't pop in. If `/settings` fails,
  // the app still works and the names stay hidden.
  beforeLoad: async ({ context }) => {
    await context.queryClient.ensureQueryData(settingsQuery).catch(() => undefined);
  },
  component: RootLayout,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  // Set by the API's sign-in redirects (`sign_in_failed`, `unavailable`).
  validateSearch: z.object({ error: z.string().optional() }),
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (me) throw redirect({ to: '/batches' });
  },
  component: LoginPage,
});

/** Every page in the shell: signed-in users only. */
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (!me) throw redirect({ to: '/login' });
    return { me };
  },
  component: AppShell,
});

const indexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/batches' });
  },
});

const batchesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/batches',
  staticData: { crumb: batchesLabel },
  component: BatchesPage,
});

const usersRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/users',
  beforeLoad: ({ context }) => {
    if (!isAdmin(context.me)) throw redirect({ to: '/batches' });
  },
  staticData: { crumb: 'Users and roles' },
  component: UsersPage,
});

/** Any other path: signed-in users get "Page not found" inside the shell, others sign in first. */
const notFoundRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '$',
  component: NotFoundPage,
});

export const routeTree = rootRoute.addChildren([
  loginRoute,
  appRoute.addChildren([indexRoute, batchesRoute, usersRoute, notFoundRoute]),
]);
