import { getLogger, type LogRecord, reset } from '@logtape/logtape';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.ts';
import { configureLogging } from '../logging/logging.ts';
import { requestLogger } from './request-logger.ts';

const createTestApp = () => createApp({ ping: () => Promise.resolve() });

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('requestLogger', () => {
  let records: LogRecord[];
  const httpRecords = (): LogRecord[] => records.filter((r) => r.category.join('.') === 'api.http');

  beforeEach(async () => {
    records = [];
    await configureLogging({ level: 'trace', format: 'json' }, (record) => records.push(record));
  });

  afterEach(async () => {
    await reset();
  });

  it('logs method, path, status, duration and requestId once per request', async () => {
    const res = await createTestApp().request('/nope?code=secret-token');

    expect(res.status).toBe(404);
    expect(httpRecords()).toHaveLength(1);
    const [record] = httpRecords();
    expect(record?.level).toBe('info');
    expect(record?.properties).toEqual({
      requestId: expect.stringMatching(uuid),
      method: 'GET',
      path: '/nope',
      status: 404,
      durationMs: expect.any(Number),
    });
    expect(JSON.stringify(record)).not.toContain('secret-token');
  });

  it.each(['/health?probe=1', '/health/ready'])('does not log the %s probe', async (path) => {
    const res = await createTestApp().request(path);

    expect(res.status).toBe(200);
    expect(res.headers.get('x-request-id')).toMatch(uuid);
    expect(httpRecords()).toEqual([]);
  });

  it('reuses and echoes a safe incoming x-request-id', async () => {
    const res = await createTestApp().request('/nope', {
      headers: { 'x-request-id': 'abc-123.X_y' },
    });

    expect(res.headers.get('x-request-id')).toBe('abc-123.X_y');
    expect(httpRecords()[0]?.properties['requestId']).toBe('abc-123.X_y');
  });

  it.each([
    ['contains spaces', 'a b'],
    ['contains a quote', 'a"b'],
    ['is too long', 'a'.repeat(129)],
  ])('replaces an incoming x-request-id that %s', async (_, incoming) => {
    const res = await createTestApp().request('/nope', { headers: { 'x-request-id': incoming } });

    expect(res.headers.get('x-request-id')).toMatch(uuid);
    expect(httpRecords()[0]?.properties['requestId']).toMatch(uuid);
  });

  it('tags records logged inside a handler with the same requestId', async () => {
    const app = new Hono().use(requestLogger()).get('/work', (c) => {
      getLogger(['api', 'test']).info('doing work');
      return c.text('done');
    });

    const res = await app.request('/work');
    const requestId = res.headers.get('x-request-id');

    const inner = records.find((r) => r.rawMessage === 'doing work');
    expect(inner?.properties).toEqual({ requestId });
    expect(httpRecords()[0]?.properties['requestId']).toBe(requestId);
  });
});
