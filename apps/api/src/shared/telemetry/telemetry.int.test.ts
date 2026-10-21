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
      scopeMetrics: z.array(
        z.object({
          metrics: z.array(
            z.object({
              name: z.string(),
              histogram: z
                .object({
                  dataPoints: z.array(z.object({ attributes: OtlpSpan.shape.attributes })),
                })
                .optional(),
            }),
          ),
        }),
      ),
    }),
  ),
});

const OtlpLog = z.object({
  body: z.object({ stringValue: z.string() }).optional(),
  traceId: z.string().optional(),
  spanId: z.string().optional(),
});
type OtlpLog = z.infer<typeof OtlpLog>;
const LogExport = z.object({
  resourceLogs: z.array(
    z.object({ scopeLogs: z.array(z.object({ logRecords: z.array(OtlpLog) })) }),
  ),
});

/** One stdout JSON line from `jsonLinesFormatter`; only the fields asserted on. */
const StdoutRecord = z.object({
  logger: z.string(),
  properties: z.record(z.string(), z.unknown()),
});

const logsOf = (received: Received[]): OtlpLog[] =>
  received
    .filter(({ path }) => path === '/v1/logs')
    .flatMap(({ body }) => LogExport.parse(body).resourceLogs)
    .flatMap(({ scopeLogs }) => scopeLogs)
    .flatMap(({ logRecords }) => logRecords);

const stdoutRecords = (output: string) =>
  output
    .split('\n')
    .filter((line) => line.startsWith('{'))
    .map((line) => StdoutRecord.parse(JSON.parse(line)));

const spansOf = (received: Received[]): OtlpSpan[] =>
  received
    .filter(({ path }) => path === '/v1/traces')
    .flatMap(({ body }) => TraceExport.parse(body).resourceSpans)
    .flatMap(({ scopeSpans }) => scopeSpans)
    .flatMap(({ spans }) => spans);

const metricsOf = (received: Received[]) =>
  received
    .filter(({ path }) => path === '/v1/metrics')
    .flatMap(({ body }) => MetricExport.parse(body).resourceMetrics)
    .flatMap(({ scopeMetrics }) => scopeMetrics)
    .flatMap(({ metrics }) => metrics);

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
  it('exports a route-named server span, its DB query, and its linked log', async () => {
    const otlp = await startReceiver();
    receiver = otlp.server;
    const api = await startApi({ OTEL_EXPORTER_OTLP_ENDPOINT: otlp.endpoint });

    expect((await fetch(`${api.baseUrl}/health`)).status).toBe(200); // liveness: silent
    const res = await fetch(`${api.baseUrl}/health/ready`, {
      headers: { 'x-request-id': 'trace-test-1' },
    });
    expect(res.status).toBe(200);
    // Google isn't configured here (503), but the span is still recorded.
    await fetch(`${api.baseUrl}/auth/google/callback?code=secret-code&state=secret-state&x=1`);
    expect(await stopApi(api.child)).toBe(0); // shutdown flushes spans, metrics and logs

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

    const durationRoutes = metricsOf(otlp.received)
      .filter(({ name }) => name === 'http.server.request.duration')
      .flatMap(({ histogram }) => histogram?.dataPoints ?? [])
      .map(({ attributes }) => attributes.find((a) => a.key === 'http.route')?.value.stringValue);
    expect(durationRoutes).toContain('/health/ready');

    // The request's log line reaches the backend linked to the same trace…
    const logs = logsOf(otlp.received);
    const requestLog = logs.find((l) => l.body?.stringValue.startsWith('GET /health/ready 200'));
    expect(requestLog, `logs: ${logs.map((l) => l.body?.stringValue).join(' | ')}`).toMatchObject({
      traceId: server.traceId,
    });
    // …and the stdout JSON line carries the trace ID too.
    const stdoutLine = stdoutRecords(api.output()).find(
      (r) => r.logger === 'api.http' && r.properties['path'] === '/health/ready',
    );
    expect(stdoutLine?.properties['trace_id']).toBe(server.traceId);

    // The OAuth callback's code and state are redacted from the span's query.
    const callback = spans.find((s) => attr(s, 'url.path') === '/auth/google/callback');
    expect(JSON.stringify(spans)).not.toMatch(/secret-code|secret-state/);
    expect(callback).toBeDefined();
    if (!callback) return;
    expect(attr(callback, 'url.query')).toBe('code=REDACTED&state=REDACTED&x=1');

    // The /health liveness probe is neither traced nor logged.
    expect(spans.filter((s) => attr(s, 'url.path') === '/health')).toEqual([]);
    expect(logs.filter((l) => l.body?.stringValue.startsWith('GET /health '))).toEqual([]);
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
