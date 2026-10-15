import { type Config, ConfigError, loadConfig } from './config.ts';

/**
 * Entry-point helper. Logging isn't configured until config loads, so config errors go to
 * stderr as plain text (names and messages only) and the process exits with code 1.
 */
export const loadConfigOrExit = (env: NodeJS.ProcessEnv = process.env): Config => {
  try {
    return loadConfig(env);
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
};
