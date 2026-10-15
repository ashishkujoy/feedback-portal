import { HealthResponse, ProblemDetails } from '@feedback-portal/contracts';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.ts';

describe('api app', () => {
  const app = createApp({ ping: () => Promise.reject(new Error('db down')) });

  it('GET /health returns 200 without touching the DB', async () => {
    const res = await app.request('/health');

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^application\/json/);
    expect(HealthResponse.parse(await res.json())).toEqual({ status: 'ok' });
  });

  it('returns a 404 problem for unknown routes', async () => {
    const res = await app.request('/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toBe('application/problem+json');
    expect(ProblemDetails.parse(await res.json()).code).toBe('not_found');
  });
});
