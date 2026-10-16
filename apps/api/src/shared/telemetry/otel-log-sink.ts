import { context } from '@opentelemetry/api';
import {
  type AnyValue,
  type AnyValueMap,
  type Logger,
  type LoggerProvider,
  SeverityNumber,
} from '@opentelemetry/api-logs';
import type { LogLevel, LogRecord, Sink } from '@logtape/logtape';

const severities: Readonly<Record<LogLevel, readonly [SeverityNumber, string]>> = {
  trace: [SeverityNumber.TRACE, 'TRACE'],
  debug: [SeverityNumber.DEBUG, 'DEBUG'],
  info: [SeverityNumber.INFO, 'INFO'],
  warning: [SeverityNumber.WARN, 'WARN'],
  error: [SeverityNumber.ERROR, 'ERROR'],
  fatal: [SeverityNumber.FATAL, 'FATAL'],
};

const stringify = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value); // circular
  }
};

/** LogTape interleaves template text (even indices) with interpolated values (odd indices). */
const renderMessage = (message: LogRecord['message']): string => message.map(stringify).join('');

const toAttribute = (value: unknown): AnyValue => {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return value === null || value === undefined ? null : stringify(value);
};

/**
 * LogTape sink that emits records through an OpenTelemetry `LoggerProvider` (OTLP to Loki).
 * The rendered message is the body, properties become attributes, and the first `Error`
 * property becomes the record's exception (`exception.type` / `.message` / `.stacktrace`).
 * The active context is attached, so records inside a request link to its trace.
 */
export const createOtelLogSink = (provider: LoggerProvider): Sink => {
  const loggers = new Map<string, Logger>();
  const loggerFor = (category: readonly string[]): Logger => {
    const name = category.join('.');
    let logger = loggers.get(name);
    if (!logger) {
      logger = provider.getLogger(name);
      loggers.set(name, logger);
    }
    return logger;
  };

  return (record) => {
    const attributes: AnyValueMap = { 'log.category': record.category.join('.') };
    let exception: Error | undefined;
    for (const [key, value] of Object.entries(record.properties)) {
      if (value instanceof Error && !exception) exception = value;
      else attributes[key] = toAttribute(value);
    }
    const [severityNumber, severityText] = severities[record.level];

    loggerFor(record.category).emit({
      timestamp: record.timestamp,
      severityNumber,
      severityText,
      body: renderMessage(record.message),
      attributes,
      exception,
      context: context.active(),
    });
  };
};
