import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { clientIp } from './client-ip.ts';

const ipWith = async (trustProxy: boolean, headers: Record<string, string> = {}) => {
  const app = new Hono().get('/', (c) => c.json({ ip: clientIp(c, { trustProxy }) }));
  const body: unknown = await (await app.request('/', { headers })).json();
  return body;
};

describe('clientIp', () => {
  it("takes nginx's X-Real-IP behind a trusted proxy", async () => {
    expect(await ipWith(true, { 'x-real-ip': '203.0.113.7' })).toEqual({ ip: '203.0.113.7' });
    expect(await ipWith(true, { 'x-real-ip': ' 2001:db8::1 ' })).toEqual({ ip: '2001:db8::1' });
  });

  it('ignores the header when the proxy is not trusted: anyone could send it', async () => {
    expect(await ipWith(false, { 'x-real-ip': '203.0.113.7' })).toEqual({ ip: null });
  });

  it('ignores a header that is not an IP, and X-Forwarded-For', async () => {
    expect(await ipWith(true, { 'x-real-ip': 'unknown' })).toEqual({ ip: null });
    expect(await ipWith(true, { 'x-forwarded-for': '203.0.113.7' })).toEqual({ ip: null });
  });
});
