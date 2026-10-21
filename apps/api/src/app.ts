import { Hono } from 'hono';
import { csrf } from 'hono/csrf';
import { type AuthRoutesDeps, authRoutes } from './modules/identity/http/auth.routes.ts';
import { meRoutes } from './modules/identity/http/me.routes.ts';
import type { AppEnv } from './shared/http/app-env.ts';
import { errorHandler, notFoundHandler } from './shared/http/error-handler.ts';
import { type HealthDeps, healthRoutes } from './shared/http/health.routes.ts';
import { requestLogger } from './shared/http/request-logger.ts';
import { traceRoute } from './shared/http/trace-route.ts';

/** Everything the routes need from the outside world; built in `main.ts`, faked in tests. */
export type AppDeps = HealthDeps & Readonly<{ auth: AuthRoutesDeps }>;

/** Shared middleware and error handling; routes are mounted by `createApp` (and tests). */
export const createBaseApp = (): Hono<AppEnv> =>
  new Hono<AppEnv>()
    .use(requestLogger(), traceRoute())
    .onError(errorHandler)
    .notFound(notFoundHandler);

/** Builds the HTTP app without binding a port, so tests can call `app.request()`. */
export const createApp = (deps: AppDeps): Hono<AppEnv> =>
  createBaseApp()
    // Form-style or bodyless writes must come from the web app (SameSite=Lax is the first layer).
    .use(csrf({ origin: deps.auth.webAppUrl }))
    .route('/health', healthRoutes(deps))
    .route('/auth', authRoutes(deps.auth))
    .route('/me', meRoutes(deps.auth));
