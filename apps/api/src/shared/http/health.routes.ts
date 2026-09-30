import type { HealthResponse } from '@feedback-portal/contracts';
import { Hono } from 'hono';

/** Liveness only: the process is up. DB readiness arrives with Postgres (1.5). */
export const healthRoutes = new Hono().get('/', (c) => c.json<HealthResponse>({ status: 'ok' }));
