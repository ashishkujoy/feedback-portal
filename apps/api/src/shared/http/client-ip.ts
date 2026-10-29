import { isIP } from 'node:net';
import { getConnInfo } from '@hono/node-server/conninfo';
import type { Context } from 'hono';

export type ClientIpOptions = Readonly<{
  /** Behind nginx (`TRUST_PROXY`), which overwrites `X-Real-IP` with the client it saw. */
  trustProxy: boolean;
}>;

/**
 * The client's address. Behind a trusted proxy, `X-Real-IP` when it holds an IP; otherwise the
 * socket's peer, or `null` outside the Node server (e.g. `app.request` in tests). Untrusted, the
 * header is ignored: anyone could send it. `X-Forwarded-For` is never read; nginx resolves it.
 */
export const clientIp = (c: Context, { trustProxy }: ClientIpOptions): string | null => {
  if (trustProxy) {
    const forwarded = c.req.header('x-real-ip')?.trim();
    if (forwarded && isIP(forwarded) !== 0) return forwarded;
  }
  const env: unknown = c.env;
  if (typeof env !== 'object' || env === null || !('incoming' in env)) return null;
  return getConnInfo(c).remote.address ?? null;
};
