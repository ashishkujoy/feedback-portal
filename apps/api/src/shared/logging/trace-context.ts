import { isSpanContextValid, trace } from '@opentelemetry/api';
import type { Sink } from '@logtape/logtape';

/**
 * Adds `trace_id` and `span_id` of the active span to each record, so a stdout log line can be
 * looked up in the tracing backend. Records outside a span (or with telemetry off) pass through.
 */
export const withTraceContext =
  (sink: Sink): Sink =>
  (record) => {
    const spanContext = trace.getActiveSpan()?.spanContext();
    if (!spanContext || !isSpanContextValid(spanContext)) return sink(record);
    sink({
      ...record,
      properties: {
        ...record.properties,
        trace_id: spanContext.traceId,
        span_id: spanContext.spanId,
      },
    });
  };
