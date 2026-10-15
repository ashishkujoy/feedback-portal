// `pnpm db:migrate`: applies pending migrations, then exits.
import { dispose, getLogger } from '@logtape/logtape';
import { loadConfigOrExit } from '../config/load-config-or-exit.ts';
import { configureLogging, rootCategory } from '../logging/logging.ts';
import { createDb } from './client.ts';
import { runMigrations } from './migrate.ts';

const config = loadConfigOrExit();
await configureLogging(config.log);
const logger = getLogger([rootCategory, 'db']);
const { db, close } = createDb(config.db);

let exitCode = 0;
try {
  await runMigrations(db);
  logger.info('migrations applied');
} catch (error) {
  logger.error('migration failed: {error}', { error });
  exitCode = 1;
} finally {
  await close();
  await dispose();
}
process.exit(exitCode);
