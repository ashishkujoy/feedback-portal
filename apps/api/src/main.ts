import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { ConfigError, loadConfig } from './shared/config/config.ts';

const SHUTDOWN_TIMEOUT_MS = 10_000;

const loadConfigOrExit = (): ReturnType<typeof loadConfig> => {
  try {
    return loadConfig(process.env);
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
};

const config = loadConfigOrExit();

const server = serve(
  { fetch: createApp().fetch, hostname: config.server.host, port: config.server.port },
  ({ port }) => {
    process.stdout.write(`api listening on http://localhost:${port} (${config.env})\n`);
  },
);

const shutdown = (signal: NodeJS.Signals): void => {
  process.stdout.write(`${signal} received, shutting down\n`);
  // Force-exit if in-flight requests don't finish in time.
  setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS).unref();
  server.close((error) => process.exit(error ? 1 : 0));
  if ('closeIdleConnections' in server) server.closeIdleConnections();
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
