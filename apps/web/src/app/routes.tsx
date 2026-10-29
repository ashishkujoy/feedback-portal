import { type MeResponse, Role } from '@feedback-portal/contracts';
import type { QueryClient } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  createRoute,
  notFound,
  redirect,
} from '@tanstack/react-router';
import { z } from 'zod';
import { batchQuery } from '../api/batches.ts';
import { internQuery } from '../api/interns.ts';
import { isApiError } from '../api/errors.ts';
import { meQuery } from '../api/me.ts';
import { settingsQuery } from '../api/settings.ts';
import { RootLayout } from '../branding/root-layout.tsx';
import { batchesLabel, isAdmin } from '../identity/roles.ts';
import { BatchPage } from '../pages/batch-page.tsx';
import { BatchesPage } from '../pages/batches-page.tsx';
import { InternPage } from '../pages/intern-page.tsx';
import { LoginPage } from '../pages/login-page.tsx';
import { NotFoundPage } from '../pages/not-found-page.tsx';
import { UsersPage } from '../pages/users-page.tsx';
import { RosterFilter } from '../interns/roster.ts';
import { AppShell } from '../shell/app-shell.tsx';

export type RouterContext = Readonly<{ queryClient: QueryClient }>;

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    /**
     * This route's breadcrumb label, or one worked out from the user and the route's loader
     * data; none (or `undefined`) adds no crumb.
     */
    crumb?:
      | string
      | ((context: Readonly<{ me: MeResponse; loaderData: unknown }>) => string | undefined);
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

/** `/batches` and the pages under it; the crumb is "Batches" (or "My batches"). */
const batchesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/batches',
  staticData: { crumb: ({ me }) => batchesLabel(me) },
});

const batchesIndexRoute = createRoute({
  getParentRoute: () => batchesRoute,
  path: '/',
  component: BatchesPage,
});

const BatchCrumb = z.object({ name: z.string() });

/**
 * One batch and the pages under it. Loaded first, so its name is in the breadcrumb straight
 * away. A batch that doesn't exist, or that the user can't see (6.4: the API's 404), is "Page not
 * found".
 */
const batchRoute = createRoute({
  getParentRoute: () => batchesRoute,
  path: '$batchId',
  loader: async ({ context, params }) => {
    if (!z.uuid().safeParse(params.batchId).success) throw notFound();
    try {
      const batch = await context.queryClient.ensureQueryData(batchQuery(params.batchId));
      return { name: batch.name };
    } catch (error) {
      if (isApiError(error, 'not_found')) throw notFound();
      // Anything else: the page shows its own error.
      return { name: undefined };
    }
  },
  staticData: { crumb: ({ loaderData }) => BatchCrumb.safeParse(loaderData).data?.name },
  notFoundComponent: NotFoundPage,
});

/** The batch page itself: its tabs and roster. */
const batchIndexRoute = createRoute({
  getParentRoute: () => batchRoute,
  path: '/',
  // The tab and the roster's view, filter and search (7.4 decision 3); bad values are dropped.
  validateSearch: z.object({
    tab: z.enum(['overview', 'interns', 'mentors']).optional().catch(undefined),
    view: z.enum(['cards', 'table']).optional().catch(undefined),
    filter: RosterFilter.optional().catch(undefined),
    q: z.string().optional().catch(undefined),
  }),
  component: BatchPage,
});

const InternCrumb = z.object({ name: z.string() });

/** An intern's profile (7.5); another batch's intern, or an unknown one, is "Page not found". */
const internRoute = createRoute({
  getParentRoute: () => batchRoute,
  path: 'interns/$internId',
  loader: async ({ context, params }) => {
    if (!z.uuid().safeParse(params.internId).success) throw notFound();
    try {
      const intern = await context.queryClient.ensureQueryData(
        internQuery(params.batchId, params.internId),
      );
      return { name: intern.name };
    } catch (error) {
      if (isApiError(error, 'not_found')) throw notFound();
      return { name: undefined };
    }
  },
  validateSearch: z.object({
    tab: z.enum(['details', 'history']).optional().catch(undefined),
  }),
  staticData: { crumb: ({ loaderData }) => InternCrumb.safeParse(loaderData).data?.name },
  component: InternPage,
  notFoundComponent: NotFoundPage,
});

const usersRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/users',
  beforeLoad: ({ context }) => {
    if (!isAdmin(context.me)) throw redirect({ to: '/batches' });
  },
  // The role tab and search, so Back and shared links keep the view; bad values are dropped.
  validateSearch: z.object({
    role: Role.optional().catch(undefined),
    q: z.string().optional().catch(undefined),
  }),
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
  appRoute.addChildren([
    indexRoute,
    batchesRoute.addChildren([
      batchesIndexRoute,
      batchRoute.addChildren([batchIndexRoute, internRoute]),
    ]),
    usersRoute,
    notFoundRoute,
  ]),
]);
