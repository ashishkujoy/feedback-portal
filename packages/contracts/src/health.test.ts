import { describe, expect, it } from 'vitest';
import { HealthResponse } from './health.ts';

describe('HealthResponse', () => {
  it('accepts { status: "ok" }', () => {
    expect(HealthResponse.parse({ status: 'ok' })).toEqual({ status: 'ok' });
  });

  it('rejects any other status', () => {
    expect(HealthResponse.safeParse({ status: 'down' }).success).toBe(false);
    expect(HealthResponse.safeParse({}).success).toBe(false);
  });
});
