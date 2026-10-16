import { trace } from '@opentelemetry/api';
import {
  InMemorySpanExporter,
  NodeTracerProvider,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-node';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createBaseApp } from '../../app.ts';
import { notFound } from '../errors/app-error.ts';

const exporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
provider.register();
const tracer = trace.getTracer('test');

const app = createBaseApp()
  .get('/things/:id', (c) => c.json({ id: c.req.param('id') }))
  .get('/missing/:id', () => {
    throw notFound('no such thing');
  })
  .get('/boom', () => {
    throw new Error('boom');
  });

/** Plays the HTTP instrumentation's part: the request runs inside an active server span. */
const requestInSpan = async (path: string, init?: RequestInit) => {
  const res = await tracer.startActiveSpan('GET', async (span) => {
    try {
      return await app.request(path, init);
    } finally {
      span.end();
    }
  });
  const [span] = exporter.getFinishedSpans();
  if (!span) throw new Error('expected one finished span');
  return { res, span };
};

beforeEach(() => {
  exporter.reset();
});

afterAll(async () => {
  await provider.shutdown();
});

describe('traceRoute', () => {
  it('names the span after the route pattern, not the raw path', async () => {
    const { res, span } = await requestInSpan('/things/42');

    expect(res.status).toBe(200);
    expect(span.name).toBe('GET /things/:id');
    expect(span.attributes['http.route']).toBe('/things/:id');
  });

  it('tags the span with the request ID from x-request-id', async () => {
    const { span } = await requestInSpan('/things/42', { headers: { 'x-request-id': 'req-1' } });

    expect(span.attributes['request.id']).toBe('req-1');
  });

  it('keeps the route for a 404 thrown by a matched handler', async () => {
    const { res, span } = await requestInSpan('/missing/7');

    expect(res.status).toBe(404);
    expect(span.name).toBe('GET /missing/:id');
  });

  it('keeps the route when the handler throws', async () => {
    const { res, span } = await requestInSpan('/boom');

    expect(res.status).toBe(500);
    expect(span.name).toBe('GET /boom');
  });

  it('leaves unmatched requests generic, so raw paths never become span names', async () => {
    const { res, span } = await requestInSpan('/no/such/path/123');

    expect(res.status).toBe(404);
    expect(span.name).toBe('GET');
    expect(span.attributes['http.route']).toBeUndefined();
  });

  it('does nothing without an active span', async () => {
    const res = await app.request('/things/42');

    expect(res.status).toBe(200);
    expect(exporter.getFinishedSpans()).toHaveLength(0);
  });
});
