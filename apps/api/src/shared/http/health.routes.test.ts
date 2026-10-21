import { HealthResponse, ProblemDetails } from '@feedback-portal/contracts';
import { type LogRecord, reset } from '@logtape/logtape';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appDeps } from '../../../test/app-deps.ts';
import { createApp } from '../../app.ts';
import { configureLogging } from '../logging/logging.ts';
import { readinessTimeoutMs } from './health.routes.ts';

const secret = 'sentinel-db-error';

describe('GET /health/ready', () => {
  let records: LogRecord[];

  beforeEach(async () => {
    records = [];
    await configureLogging({ level: 'trace', format: 'json' }, (record) => records.push(record));
  });

  afterEach(async () => {
    vi.useRealTimers();
    await reset();
  });

  it('returns 200 when the database answers', async () => {
    const ping = vi.fn<() => Promise<void>>(() => Promise.resolve());

    const res = await createApp(appDeps(ping)).request('/health/ready');

    expect(res.status).toBe(200);
    expect(HealthResponse.parse(await res.json())).toEqual({ status: 'ok' });
    expect(ping).toHaveBeenCalledOnce();
  });

  it('returns a 503 problem without leaking the error, and logs a warning', async () => {
    const app = createApp(appDeps(() => Promise.reject(new Error(`password ${secret}`))));

    const res = await app.request('/health/ready');
    const text = await res.clone().text();

    expect(res.status).toBe(503);
    expect(res.headers.get('content-type')).toBe('application/problem+json');
    expect(ProblemDetails.parse(await res.json())).toMatchObject({
      title: 'Service Unavailable',
      code: 'unavailable',
      detail: 'Database unavailable',
    });
    expect(text).not.toContain(secret);

    const warnings = records.filter((r) => r.level === 'warning');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.properties['requestId']).toBe(res.headers.get('x-request-id'));
  });

  it('returns 503 when the database does not answer in time', async () => {
    vi.useFakeTimers();
    const app = createApp(appDeps(() => new Promise<void>(() => {})));

    const pending = app.request('/health/ready');
    await vi.advanceTimersByTimeAsync(readinessTimeoutMs);
    const res = await pending;

    expect(res.status).toBe(503);
    expect(ProblemDetails.parse(await res.json()).code).toBe('unavailable');
  });
});
