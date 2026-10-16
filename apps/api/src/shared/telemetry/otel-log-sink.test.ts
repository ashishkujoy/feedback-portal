import { trace } from '@opentelemetry/api';
import { SeverityNumber } from '@opentelemetry/api-logs';
import {
  InMemoryLogRecordExporter,
  LoggerProvider,
  SimpleLogRecordProcessor,
} from '@opentelemetry/sdk-logs';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import type { LogLevel, LogRecord } from '@logtape/logtape';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createOtelLogSink } from './otel-log-sink.ts';

const tracerProvider = new NodeTracerProvider();
tracerProvider.register();
const exporter = new InMemoryLogRecordExporter();
const loggerProvider = new LoggerProvider({
  processors: [new SimpleLogRecordProcessor({ exporter })],
});
const sink = createOtelLogSink(loggerProvider);

const record = (overrides: Partial<LogRecord> = {}): LogRecord => ({
  category: ['api', 'http'],
  level: 'info',
  message: ['', 'GET', ' ', '/nope', ' ', 404],
  rawMessage: '{method} {path} {status}',
  timestamp: 1_700_000_000_000,
  properties: { method: 'GET', path: '/nope', status: 404 },
  ...overrides,
});

const exported = () => {
  const [first] = exporter.getFinishedLogRecords();
  if (!first) throw new Error('expected an exported log record');
  return first;
};

beforeEach(() => {
  exporter.reset();
});

afterAll(async () => {
  await Promise.all([loggerProvider.shutdown(), tracerProvider.shutdown()]);
});

describe('createOtelLogSink', () => {
  it('renders the message as the body, without quoting values', () => {
    sink(record());

    expect(exported().body).toBe('GET /nope 404');
  });

  it('maps properties to attributes and records the category and scope', () => {
    sink(record({ properties: { method: 'GET', ok: true, nested: { a: 1 }, none: null } }));

    const log = exported();
    expect(log.attributes).toEqual({
      'log.category': 'api.http',
      method: 'GET',
      ok: true,
      nested: '{"a":1}',
      none: null,
    });
    expect(log.instrumentationScope.name).toBe('api.http');
  });

  it('turns an Error property into exception attributes', () => {
    sink(record({ level: 'error', properties: { requestId: 'r-1', error: new TypeError('bad') } }));

    const { attributes } = exported();
    expect(attributes).toMatchObject({
      requestId: 'r-1',
      'exception.type': 'TypeError',
      'exception.message': 'bad',
    });
    expect(attributes['exception.stacktrace']).toEqual(expect.stringContaining('TypeError: bad'));
    expect(attributes).not.toHaveProperty('error');
  });

  it.each<[LogLevel, SeverityNumber, string]>([
    ['trace', SeverityNumber.TRACE, 'TRACE'],
    ['debug', SeverityNumber.DEBUG, 'DEBUG'],
    ['info', SeverityNumber.INFO, 'INFO'],
    ['warning', SeverityNumber.WARN, 'WARN'],
    ['error', SeverityNumber.ERROR, 'ERROR'],
    ['fatal', SeverityNumber.FATAL, 'FATAL'],
  ])('maps %s to severity %i %s', (level, severityNumber, severityText) => {
    sink(record({ level }));

    expect(exported()).toMatchObject({ severityNumber, severityText });
  });

  it('keeps the record timestamp', () => {
    sink(record());

    expect(exported().hrTime).toEqual([1_700_000_000, 0]);
  });

  it('links records logged inside a span to that span', () => {
    const { traceId, spanId } = trace.getTracer('test').startActiveSpan('request', (span) => {
      sink(record());
      span.end();
      return span.spanContext();
    });

    expect(exported().spanContext).toMatchObject({ traceId, spanId });
  });

  it('has no span context outside a span', () => {
    sink(record());

    expect(exported().spanContext).toBeUndefined();
  });
});
