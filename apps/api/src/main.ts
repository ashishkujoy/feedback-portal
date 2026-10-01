import { serve } from '@hono/node-server';
import { dispose, getLogger } from '@logtape/logtape';
import { createApp } from './app.ts';
import { ConfigError, loadConfig } from './shared/config/config.ts';
import { configureLogging, rootCategory } from './shared/logging/logging.ts';

const SHUTDOWN_TIMEOUT_MS = 10_000;

// Logging isn't configured until config loads, so config errors go to stderr as plain text.
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
await configureLogging(config.log);
const logger = getLogger([rootCategory]);

const exit = async (code: number): Promise<never> => {
  await dispose(); // flush buffered records
  process.exit(code);
};

const server = serve(
  { fetch: createApp().fetch, hostname: config.server.host, port: config.server.port },
  ({ port }) => {
    logger.info('api listening on http://localhost:{port}', {
      host: config.server.host,
      port,
      env: config.env,
    });
  },
);

const shutdown = (signal: NodeJS.Signals): void => {
  logger.info('{signal} received, shutting down', { signal });
  // Force-exit if in-flight requests don't finish in time.
  setTimeout(() => {
    logger.error('shutdown timed out after {timeoutMs}ms', { timeoutMs: SHUTDOWN_TIMEOUT_MS });
    void exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();
  server.close((error) => void exit(error ? 1 : 0));
  if ('closeIdleConnections' in server) server.closeIdleConnections();
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
