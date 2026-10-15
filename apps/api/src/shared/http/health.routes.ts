import type { HealthResponse } from '@feedback-portal/contracts';
import { getLogger } from '@logtape/logtape';
import { Hono } from 'hono';
import { rootCategory } from '../logging/logging.ts';
import type { AppEnv } from './app-env.ts';
import { problemResponse } from './problem.ts';

export const readinessTimeoutMs = 2000;

export type HealthDeps = Readonly<{
  /** Resolves when the database answers; rejects otherwise. */
  ping: () => Promise<void>;
}>;

const logger = getLogger([rootCategory, 'health']);

const withTimeout = async (promise: Promise<void>, ms: number): Promise<void> => {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
  });
  try {
    await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
};

/**
 * `GET /health` — liveness: the process is up (never touches the DB).
 * `GET /health/ready` — readiness: the DB answers within the timeout.
 */
export const healthRoutes = ({ ping }: HealthDeps) =>
  new Hono<AppEnv>()
    .get('/', (c) => c.json<HealthResponse>({ status: 'ok' }))
    .get('/ready', async (c) => {
      try {
        await withTimeout(ping(), readinessTimeoutMs);
        return c.json<HealthResponse>({ status: 'ok' });
      } catch (error) {
        logger.warn('database not ready: {error}', { requestId: c.get('requestId'), error });
        return problemResponse(c, {
          status: 503,
          code: 'unavailable',
          detail: 'Database unavailable',
        });
      }
    });
