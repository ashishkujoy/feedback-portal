// `pnpm db:seed`: makes sure an active admin exists (see `bootstrapAdmin`), then exits.
import { dispose, getLogger } from '@logtape/logtape';
import { loadConfigOrExit } from '../../shared/config/load-config-or-exit.ts';
import { createDb } from '../../shared/db/client.ts';
import { configureLogging, rootCategory } from '../../shared/logging/logging.ts';
import { runBootstrapAdmin } from './infrastructure/run-bootstrap-admin.ts';

const config = loadConfigOrExit();
await configureLogging(config.log);
// The email is personal data and is already in the environment, so it isn't logged.
const logger = getLogger([rootCategory, 'seed']);

let exitCode = 0;
if (config.bootstrapAdmin === null) {
  logger.info('bootstrap admin: not_configured (BOOTSTRAP_ADMIN_EMAIL is not set)');
} else {
  const { db, close } = createDb(config.db);
  try {
    const result = await runBootstrapAdmin(db, config.bootstrapAdmin);
    logger.info('bootstrap admin: {outcome}', { ...result });
  } catch (error) {
    logger.error('bootstrap admin failed: {error}', { error });
    exitCode = 1;
  } finally {
    await close();
  }
}
await dispose();
process.exit(exitCode);
