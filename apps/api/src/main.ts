import { serve } from '@hono/node-server';
import { dispose, getLogger } from '@logtape/logtape';
import { createApp } from './app.ts';
import { createBatchAccess } from './modules/cohort/infrastructure/drizzle-batch-access.ts';
import { createBatchAdminTransaction } from './modules/cohort/infrastructure/drizzle-batch-admin.ts';
import { createBatchQueries } from './modules/cohort/infrastructure/drizzle-batch-queries.ts';
import { createRoleAssignments } from './modules/cohort/infrastructure/drizzle-role-assignments.ts';
import { createSessions } from './modules/identity/application/sessions.ts';
import { createGoogleAuth } from './modules/identity/infrastructure/google-oauth.ts';
import { createUserAdminTransaction } from './modules/identity/infrastructure/drizzle-user-admin.ts';
import { createSessionRepository } from './modules/identity/infrastructure/drizzle-session-repository.ts';
import { createUserRepository } from './modules/identity/infrastructure/drizzle-user-repository.ts';
import { createInternCounts } from './modules/intern/infrastructure/drizzle-intern-counts.ts';
import { createAirtableRestSource } from './modules/intern/infrastructure/airtable-rest-source.ts';
import { createCloudinaryPhotoStorage } from './modules/intern/infrastructure/cloudinary-photo-storage.ts';
import { createImportRuns } from './modules/intern/infrastructure/drizzle-import-runs.ts';
import { createFeedbackTransaction } from './modules/feedback/infrastructure/drizzle-feedback-admin.ts';
import { createInternAdminTransaction } from './modules/intern/infrastructure/drizzle-intern-admin.ts';
import { googleEndpoints } from './shared/config/config.ts';
import { loadConfigOrExit } from './shared/config/load-config-or-exit.ts';
import { createDb } from './shared/db/client.ts';
import { configureLogging, rootCategory } from './shared/logging/logging.ts';
import {
  isTelemetryStarted,
  shutdownTelemetry,
  telemetryLogSink,
} from './shared/telemetry/handle.ts';

const SHUTDOWN_TIMEOUT_MS = 10_000;

const config = loadConfigOrExit();
await configureLogging(config.log, undefined, telemetryLogSink());
const logger = getLogger([rootCategory]);
const database = createDb(config.db);

if (config.telemetry.enabled && !isTelemetryStarted()) {
  logger.warning(
    'telemetry is configured but not loaded; start with --import ./src/instrumentation.ts',
  );
}

if (!config.auth.google) {
  logger.warning('Google sign-in is not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)');
}

if (
  config.auth.google &&
  (config.auth.google.authorizationEndpoint !== googleEndpoints.authorization ||
    config.auth.google.tokenEndpoint !== googleEndpoints.token)
) {
  logger.warning(
    'Google sign-in uses a stand-in (GOOGLE_AUTHORIZATION_URL / GOOGLE_TOKEN_URL): tests only',
  );
}

const now = (): Date => new Date();
const auth = {
  users: createUserRepository(database.db),
  sessions: createSessions({ sessions: createSessionRepository(database.db), now }),
  googleAuth: config.auth.google ? createGoogleAuth(config.auth.google) : null,
  webAppUrl: config.auth.webAppUrl,
  secureCookies: config.auth.secureCookies,
  now,
};

const exit = async (code: number): Promise<never> => {
  await dispose(); // flush buffered records
  process.exit(code);
};

const server = serve(
  {
    fetch: createApp({
      ping: database.ping,
      branding: config.branding,
      photosEnabled: config.photos !== null,
      auth,
      userAdmin: createUserAdminTransaction(database.db, now, createRoleAssignments),
      manageBatches: {
        transaction: createBatchAdminTransaction(database.db, createInternCounts),
        queries: createBatchQueries(database.db, createInternCounts),
        now,
      },
      manageInterns: {
        transaction: createInternAdminTransaction(database.db, createBatchAccess),
        photos: config.photos ? createCloudinaryPhotoStorage(config.photos) : null,
        airtable: createAirtableRestSource({ apiBaseUrl: config.airtable.apiBaseUrl }),
        importRuns: createImportRuns(database.db),
        now,
      },
      manageFeedback: {
        transaction: createFeedbackTransaction(database.db, createBatchAccess),
        now,
      },
    }).fetch,
    hostname: config.server.host,
    port: config.server.port,
  },
  ({ port }) => {
    logger.info('api listening on http://localhost:{port}', {
      host: config.server.host,
      port,
      env: config.env,
    });
  },
);

const closeServer = (): Promise<void> =>
  new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    if ('closeIdleConnections' in server) server.closeIdleConnections();
  });

const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  logger.info('{signal} received, shutting down', { signal });
  // Force-exit if in-flight requests don't finish in time.
  setTimeout(() => {
    logger.error('shutdown timed out after {timeoutMs}ms', { timeoutMs: SHUTDOWN_TIMEOUT_MS });
    void exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();

  try {
    await closeServer(); // stop accepting requests; wait for in-flight ones
    await database.close(); // then drain and close the pool
    await shutdownTelemetry(); // flush the last spans and metrics
    await exit(0);
  } catch (error) {
    logger.error('shutdown failed: {error}', { error });
    await exit(1);
  }
};

const onSignal = (signal: NodeJS.Signals): void => void shutdown(signal);

process.once('SIGINT', onSignal);
process.once('SIGTERM', onSignal);
