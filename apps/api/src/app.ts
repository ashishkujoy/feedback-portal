import { Hono } from 'hono';
import type { AppEnv } from './shared/http/app-env.ts';
import { errorHandler, notFoundHandler } from './shared/http/error-handler.ts';
import { type HealthDeps, healthRoutes } from './shared/http/health.routes.ts';
import { requestLogger } from './shared/http/request-logger.ts';
import { traceRoute } from './shared/http/trace-route.ts';

/** Everything the routes need from the outside world; built in `main.ts`, faked in tests. */
export type AppDeps = HealthDeps;

/** Shared middleware and error handling; routes are mounted by `createApp` (and tests). */
export const createBaseApp = (): Hono<AppEnv> =>
  new Hono<AppEnv>()
    .use(requestLogger(), traceRoute())
    .onError(errorHandler)
    .notFound(notFoundHandler);

/** Builds the HTTP app without binding a port, so tests can call `app.request()`. */
export const createApp = (deps: AppDeps): Hono<AppEnv> =>
  createBaseApp().route('/health', healthRoutes(deps));
