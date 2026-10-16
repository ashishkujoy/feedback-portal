import { trace } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import type { LogRecord } from '@logtape/logtape';
import { afterAll, describe, expect, it } from 'vitest';
import { withTraceContext } from './trace-context.ts';

const provider = new NodeTracerProvider();
provider.register();
const tracer = trace.getTracer('test');

const record: LogRecord = {
  category: ['api', 'test'],
  level: 'info',
  message: ['hello'],
  rawMessage: 'hello',
  timestamp: 0,
  properties: { requestId: 'r-1' },
};

const capture = () => {
  const records: LogRecord[] = [];
  return { records, sink: withTraceContext((r) => records.push(r)) };
};

afterAll(async () => {
  await provider.shutdown();
});

describe('withTraceContext', () => {
  it('adds trace_id and span_id inside an active span, keeping other properties', () => {
    const { records, sink } = capture();

    const { traceId, spanId } = tracer.startActiveSpan('work', (span) => {
      sink(record);
      span.end();
      return span.spanContext();
    });

    expect(records[0]?.properties).toEqual({
      requestId: 'r-1',
      trace_id: traceId,
      span_id: spanId,
    });
    expect(record.properties).toEqual({ requestId: 'r-1' }); // input not mutated
  });

  it('passes records through unchanged outside a span', () => {
    const { records, sink } = capture();

    sink(record);

    expect(records).toEqual([record]);
  });
});
