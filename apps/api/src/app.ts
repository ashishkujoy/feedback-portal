import { Hono } from 'hono';
import { healthRoutes } from './shared/http/health.routes.ts';
import { requestLogger } from './shared/http/request-logger.ts';

/** Builds the HTTP app without binding a port, so tests can call `app.request()`. */
export const createApp = (): Hono => new Hono().use(requestLogger()).route('/health', healthRoutes);
