import { serve } from '@hono/node-server';
import { createApp } from './app.ts';

const PORT = 3000; // Moves to validated config in 1.2.
const SHUTDOWN_TIMEOUT_MS = 10_000;

const server = serve({ fetch: createApp().fetch, port: PORT }, ({ port }) => {
  process.stdout.write(`api listening on http://localhost:${port}\n`);
});

const shutdown = (signal: NodeJS.Signals): void => {
  process.stdout.write(`${signal} received, shutting down\n`);
  // Force-exit if in-flight requests don't finish in time.
  setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS).unref();
  server.close((error) => process.exit(error ? 1 : 0));
  if ('closeIdleConnections' in server) server.closeIdleConnections();
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
