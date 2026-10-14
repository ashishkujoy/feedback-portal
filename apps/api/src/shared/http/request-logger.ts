import { getLogger, withContext } from '@logtape/logtape';
import { createMiddleware } from 'hono/factory';
import { rootCategory } from '../logging/logging.ts';
import type { AppEnv } from './app-env.ts';

const requestIdHeader = 'x-request-id';
/** Incoming IDs outside this charset/length are replaced, to prevent log injection. */
const safeRequestId = /^[\w.-]{1,128}$/;
const skippedPaths = new Set(['/health']);

const logger = getLogger([rootCategory, 'http']);

const resolveRequestId = (incoming: string | undefined): string =>
  incoming !== undefined && safeRequestId.test(incoming) ? incoming : crypto.randomUUID();

/**
 * Tags every record logged during a request with `requestId`, echoes it in `x-request-id`,
 * and logs one record per request. `path` excludes the query string, which can carry tokens.
 */
export const requestLogger = () =>
  createMiddleware<AppEnv>(async (c, next) => {
    const requestId = resolveRequestId(c.req.header(requestIdHeader));
    c.set('requestId', requestId);
    const start = performance.now();

    await withContext({ requestId }, next);
    c.header(requestIdHeader, requestId);

    if (skippedPaths.has(c.req.path)) return;
    logger.info('{method} {path} {status} {durationMs}ms', {
      requestId,
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: Math.round((performance.now() - start) * 10) / 10,
    });
  });
