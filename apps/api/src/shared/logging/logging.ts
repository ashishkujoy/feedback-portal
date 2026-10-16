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
import { withTraceContext } from './trace-context.ts';

/** Root category; modules log under sub-categories such as `['api', 'http']`. */
export const rootCategory = 'api';

const stdoutSink = (format: LogConfig['format']): Sink =>
  getStreamSink(Writable.toWeb(process.stdout), {
    formatter: format === 'json' ? jsonLinesFormatter : ansiColorFormatter,
  });

/** The SDK's own diagnostics; never exported over OTLP, so a failing export can't feed itself. */
export const otelCategory = [rootCategory, 'otel'] as const;

/**
 * Configures LogTape once per process. The sink is injectable so tests can capture records.
 * Request-scoped context (e.g. `requestId`) relies on the AsyncLocalStorage set here.
 * Records in a traced request carry `trace_id`/`span_id`. With `otelSink` (telemetry on),
 * `api` records are also exported over OTLP.
 */
export const configureLogging = async (
  log: LogConfig,
  sink: Sink = stdoutSink(log.format),
  otelSink?: Sink,
): Promise<void> => {
  const sinks: Record<string, Sink> = { main: withTraceContext(sink) };
  if (otelSink) sinks['otel'] = otelSink;
  const apiSinks = otelSink ? ['main', 'otel'] : ['main'];

  await configure({
    reset: true,
    contextLocalStorage: new AsyncLocalStorage(),
    sinks,
    loggers: [
      { category: rootCategory, lowestLevel: log.level, sinks: apiSinks },
      { category: [...otelCategory], sinks: ['main'], parentSinks: 'override' },
      { category: ['logtape', 'meta'], lowestLevel: 'warning', sinks: ['main'] },
    ],
  });
};
