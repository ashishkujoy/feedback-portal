import { type ChildProcess, spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { useTestDb } from '../../../test/test-db.ts';

const testDb = useTestDb();
const apiDir = fileURLToPath(new URL('../../..', import.meta.url));

type Received = { path: string; body: unknown };

const portOf = (server: Server): number => {
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('expected a TCP server');
  return address.port;
};

/** A minimal OTLP/HTTP (JSON) collector: records every export request. */
const startReceiver = async () => {
  const received: Received[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      received.push({ path: req.url ?? '', body: JSON.parse(Buffer.concat(chunks).toString()) });
      res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { server, received, endpoint: `http://127.0.0.1:${portOf(server)}` };
};

const freePort = async (): Promise<number> => {
  const probe = createServer().listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = portOf(probe);
  probe.close();
  await once(probe, 'close');
  return port;
};

/** Runs the API exactly as `pnpm start` does, with the preload. */
const startApi = async (env: Record<string, string>) => {
  const port = await freePort();
  const child = spawn(process.execPath, ['--import', './src/instrumentation.ts', 'src/main.ts'], {
    cwd: apiDir,
    env: {
      PATH: process.env['PATH'] ?? '',
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      PORT: String(port),
      LOG_FORMAT: 'json',
      DATABASE_URL: testDb.url,
      PROGRAM_NAME: 'Test Program',
      ORG_NAME: 'Test Org',
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
  child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
  await new Promise<void>((resolve, reject) => {
    const onData = () => output.includes('api listening') && resolve();
    child.stdout.on('data', onData);
    child.once('exit', (code) => reject(new Error(`api exited early (${code}):\n${output}`)));
  });
  return { child, baseUrl: `http://127.0.0.1:${port}`, output: () => output };
};

const stopApi = async (child: ChildProcess): Promise<number | null> => {
  const exited = new Promise<number | null>((resolve) => child.once('exit', resolve));
  child.kill('SIGTERM');
  return exited;
};

// OTLP/JSON shapes, only the fields asserted on.
const OtlpSpan = z.object({
  traceId: z.string(),
  spanId: z.string(),
  parentSpanId: z.string().optional(),
  name: z.string(),
  attributes: z.array(
    z.object({
      key: z.string(),
      value: z.object({
        stringValue: z.string().optional(),
        intValue: z.union([z.string(), z.number()]).optional(),
      }),
    }),
  ),
});
type OtlpSpan = z.infer<typeof OtlpSpan>;
const TraceExport = z.object({
  resourceSpans: z.array(z.object({ scopeSpans: z.array(z.object({ spans: z.array(OtlpSpan) })) })),
});
const MetricExport = z.object({
  resourceMetrics: z.array(
    z.object({
      scopeMetrics: z.array(z.object({ metrics: z.array(z.object({ name: z.string() })) })),
    }),
  ),
});

const spansOf = (received: Received[]): OtlpSpan[] =>
  received
    .filter(({ path }) => path === '/v1/traces')
    .flatMap(({ body }) => TraceExport.parse(body).resourceSpans)
    .flatMap(({ scopeSpans }) => scopeSpans)
    .flatMap(({ spans }) => spans);

const metricNamesOf = (received: Received[]): string[] =>
  received
    .filter(({ path }) => path === '/v1/metrics')
    .flatMap(({ body }) => MetricExport.parse(body).resourceMetrics)
    .flatMap(({ scopeMetrics }) => scopeMetrics)
    .flatMap(({ metrics }) => metrics.map(({ name }) => name));

const attr = (span: OtlpSpan, key: string): string | number | undefined => {
  const value = span.attributes.find((a) => a.key === key)?.value;
  return value?.stringValue ?? value?.intValue;
};

let receiver: Server | undefined;
afterEach(() => {
  receiver?.close();
  receiver = undefined;
});

describe('telemetry (real process)', () => {
  it('exports a route-named server span with the DB query as a descendant', async () => {
    const otlp = await startReceiver();
    receiver = otlp.server;
    const api = await startApi({ OTEL_EXPORTER_OTLP_ENDPOINT: otlp.endpoint });

    const res = await fetch(`${api.baseUrl}/health/ready`, {
      headers: { 'x-request-id': 'trace-test-1' },
    });
    expect(res.status).toBe(200);
    expect(await stopApi(api.child)).toBe(0); // shutdown flushes spans and metrics

    const spans = spansOf(otlp.received);
    const server = spans.find((s) => s.name === 'GET /health/ready');
    expect(server, `spans: ${spans.map((s) => s.name).join(', ')}`).toBeDefined();
    if (!server) return;
    expect(attr(server, 'http.route')).toBe('/health/ready');
    expect(attr(server, 'request.id')).toBe('trace-test-1');
    expect(Number(attr(server, 'http.response.status_code'))).toBe(200);

    const query = spans.find((s) => attr(s, 'db.query.text') === 'select 1');
    expect(
      query,
      `spans: ${JSON.stringify(spans.map((s) => [s.name, s.attributes]))}`,
    ).toBeDefined();
    if (!query) return;
    expect(query.traceId).toBe(server.traceId);

    // Walk up from the query to the server span.
    const byId = new Map(spans.map((s) => [s.spanId, s]));
    let current: OtlpSpan | undefined = query;
    while (current && current !== server) current = byId.get(current.parentSpanId ?? '');
    expect(current).toBe(server);

    expect(metricNamesOf(otlp.received)).toContain('http.server.request.duration');
  });

  it('exports nothing without an endpoint, and still serves', async () => {
    const otlp = await startReceiver();
    receiver = otlp.server;
    const api = await startApi({});

    const res = await fetch(`${api.baseUrl}/health/ready`);
    expect(res.status).toBe(200);
    expect(await stopApi(api.child)).toBe(0);

    expect(otlp.received).toHaveLength(0);
  });
});
