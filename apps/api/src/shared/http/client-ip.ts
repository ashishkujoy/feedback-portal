import { getConnInfo } from '@hono/node-server/conninfo';
import type { Context } from 'hono';

/**
 * The peer address of the socket, or `null` outside the Node server (e.g. `app.request` in tests).
 * `x-forwarded-for` is ignored: anyone can send it unless a trusted proxy sets it (deployment, 11.x).
 */
export const clientIp = (c: Context): string | null => {
  const env: unknown = c.env;
  if (typeof env !== 'object' || env === null || !('incoming' in env)) return null;
  return getConnInfo(c).remote.address ?? null;
};
