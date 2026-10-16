import { trace } from '@opentelemetry/api';
import { ATTR_HTTP_ROUTE } from '@opentelemetry/semantic-conventions';
import { createMiddleware } from 'hono/factory';
import { matchedRoutes } from 'hono/route';
import type { AppEnv } from './app-env.ts';

/**
 * Names the HTTP server span after the matched route (`GET /interns/:id`), which the HTTP
 * instrumentation can't know, and tags it with the request ID. Unmatched requests keep the
 * generic name so raw paths (with IDs) never become span names. No-op without an active span.
 */
export const traceRoute = () =>
  createMiddleware<AppEnv>(async (c, next) => {
    const span = trace.getActiveSpan();
    span?.setAttribute('request.id', c.get('requestId'));

    await next();
    if (!span) return;

    // The last match is the handler that responded; a 404 whose last match is middleware
    // (`app.use`) means no route matched.
    const route = matchedRoutes(c).at(-1);
    if (!route || (route.method === 'ALL' && c.res.status === 404)) return;
    span.setAttribute(ATTR_HTTP_ROUTE, route.path);
    span.updateName(`${c.req.method} ${route.path}`);
  });
