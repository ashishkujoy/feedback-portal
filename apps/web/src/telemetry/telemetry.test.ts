import { trace } from '@opentelemetry/api';
import { SpanKind } from '@opentelemetry/api';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-web';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubApi } from '../test/stub-api.ts';
import { loadTelemetry } from './load-telemetry.ts';
import { serviceName, startTelemetry } from './telemetry.ts';

let stop: (() => Promise<void>) | undefined;

afterEach(async () => {
  await stop?.();
  stop = undefined;
  trace.disable();
  vi.unstubAllGlobals();
});

const traced = () => {
  const exporter = new InMemorySpanExporter();
  stop = startTelemetry({
    tracesUrl: '/otlp/v1/traces',
    spanProcessor: new SimpleSpanProcessor(exporter),
  });
  return exporter;
};

const headersOf = (init: RequestInit | undefined) => new Headers(init?.headers);

describe('browser tracing', () => {
  it('sends traceparent with same-origin API requests and records a client span', async () => {
    const fetchMock = stubApi({ '/me': { status: 200, body: {} } });
    const exporter = traced();

    await fetch('/api/me');

    const traceparent = headersOf(fetchMock.mock.calls[0]?.[1]).get('traceparent');
    expect(traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
    await vi.waitFor(() => {
      expect(exporter.getFinishedSpans()).toHaveLength(1);
    });
    const [span] = exporter.getFinishedSpans();
    expect(span?.kind).toBe(SpanKind.CLIENT);
    expect(span?.resource.attributes['service.name']).toBe(serviceName);
    expect(span?.spanContext().traceId).toBe(traceparent?.split('-')[1]);
    expect(span?.attributes).toMatchObject({
      'http.request.method': 'GET',
      'http.response.status_code': 200,
    });
  });

  it("doesn't trace the exporter's own requests", async () => {
    const fetchMock = stubApi({ 'POST /otlp/v1/traces': { status: 200, body: {} } });
    const exporter = traced();

    await fetch('/otlp/v1/traces', { method: 'POST', body: '{}' });

    expect(headersOf(fetchMock.mock.calls[0]?.[1]).has('traceparent')).toBe(false);
    expect(exporter.getFinishedSpans()).toHaveLength(0);
  });

  it('stays off without a traces URL: fetch is left alone', async () => {
    const fetchMock = stubApi({});

    await loadTelemetry(undefined);

    expect(globalThis.fetch).toBe(fetchMock);
  });
});
