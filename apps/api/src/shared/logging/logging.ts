import { AsyncLocalStorage } from 'node:async_hooks';
import { Writable } from 'node:stream';
import {
  ansiColorFormatter,
  configure,
  getStreamSink,
  jsonLinesFormatter,
  type Sink,
} from '@logtape/logtape';
import type { LogConfig } from '../config/config.ts';

/** Root category; modules log under sub-categories such as `['api', 'http']`. */
export const rootCategory = 'api';

const stdoutSink = (format: LogConfig['format']): Sink =>
  getStreamSink(Writable.toWeb(process.stdout), {
    formatter: format === 'json' ? jsonLinesFormatter : ansiColorFormatter,
  });

/**
 * Configures LogTape once per process. The sink is injectable so tests can capture records.
 * Request-scoped context (e.g. `requestId`) relies on the AsyncLocalStorage set here.
 */
export const configureLogging = async (
  log: LogConfig,
  sink: Sink = stdoutSink(log.format),
): Promise<void> => {
  await configure({
    reset: true,
    contextLocalStorage: new AsyncLocalStorage(),
    sinks: { main: sink },
    loggers: [
      { category: rootCategory, lowestLevel: log.level, sinks: ['main'] },
      { category: ['logtape', 'meta'], lowestLevel: 'warning', sinks: ['main'] },
    ],
  });
};
