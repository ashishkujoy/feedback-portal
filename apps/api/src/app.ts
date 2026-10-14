import { Hono } from 'hono';
import type { AppEnv } from './shared/http/app-env.ts';
import { errorHandler, notFoundHandler } from './shared/http/error-handler.ts';
import { healthRoutes } from './shared/http/health.routes.ts';
import { requestLogger } from './shared/http/request-logger.ts';

/** Shared middleware and error handling; routes are mounted by `createApp` (and tests). */
export const createBaseApp = (): Hono<AppEnv> =>
  new Hono<AppEnv>().use(requestLogger()).onError(errorHandler).notFound(notFoundHandler);

/** Builds the HTTP app without binding a port, so tests can call `app.request()`. */
export const createApp = (): Hono<AppEnv> => createBaseApp().route('/health', healthRoutes);
