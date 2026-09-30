import { HealthResponse } from '@feedback-portal/contracts';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.ts';

describe('api app', () => {
  const app = createApp();

  it('GET /health returns 200 with the health contract', async () => {
    const res = await app.request('/health');

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^application\/json/);
    expect(HealthResponse.parse(await res.json())).toEqual({ status: 'ok' });
  });

  it('returns 404 for unknown routes', async () => {
    const res = await app.request('/does-not-exist');

    expect(res.status).toBe(404);
  });
});
