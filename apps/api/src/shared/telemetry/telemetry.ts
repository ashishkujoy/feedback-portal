import { type DiagLogger, DiagLogLevel, diag, metrics } from '@opentelemetry/api';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { type Instrumentation, registerInstrumentations } from '@opentelemetry/instrumentation';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchSpanProcessor, NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { getLogger, type Sink } from '@logtape/logtape';
import packageJson from '../../../package.json' with { type: 'json' };
import type { Config } from '../config/config.ts';
import { otelCategory } from '../logging/logging.ts';
import { createOtelLogSink } from './otel-log-sink.ts';

type EnabledTelemetry = Extract<Config['telemetry'], { enabled: true }>;

export type Telemetry = Readonly<{
  /** LogTape sink exporting records over OTLP; passed to `configureLogging`. */
  logSink: Sink;
  /** Flushes pending spans, metrics and logs, then stops exporting. */
  shutdown: () => Promise<void>;
}>;

/** Liveness probe, hit every few seconds by Docker; neither traced nor logged. */
const livenessPath = '/health';

// SDK diagnostics (failed exports, misconfiguration) go to LogTape. Records emitted before
// `configureLogging` runs in main.ts are dropped, which only affects start-up.
const otelLogger = getLogger([...otelCategory]);
const diagLogger: DiagLogger = {
  error: (message, ...args) => otelLogger.error(message, { args }),
  warn: (message, ...args) => otelLogger.warning(message, { args }),
  info: (message, ...args) => otelLogger.info(message, { args }),
  debug: (message, ...args) => otelLogger.debug(message, { args }),
  verbose: (message, ...args) => otelLogger.trace(message, { args }),
};

/** The auto-instrumentations, created before the app imports `pg` or `node:http`. */
/** Query parameters whose values are replaced in server spans. */
export const redactedQueryParams = ['code', 'state'] as const;

export const createInstrumentations = (): Instrumentation[] => [
  new HttpInstrumentation({
    ignoreIncomingRequestHook: (request) => request.url?.split('?')[0] === livenessPath,
    // The OAuth callback's `code` and `state` must never reach a span's `url.query`.
    redactedQueryParamsServer: [...redactedQueryParams],
  }),
  // Values stay out of spans; queries outside a request (pool warm-up, shutdown) make no span.
  new PgInstrumentation({ enhancedDatabaseReporting: false, requireParentSpan: true }),
];

export const startTelemetry = (
  config: EnabledTelemetry,
  env: Config['env'],
  instrumentations: Instrumentation[],
): Telemetry => {
  diag.setLogger(diagLogger, DiagLogLevel.WARN);

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: config.serviceName,
    [ATTR_SERVICE_VERSION]: packageJson.version,
    'deployment.environment.name': env,
  });

  const tracerProvider = new NodeTracerProvider({
    resource,
    spanProcessors: [
      new BatchSpanProcessor(new OTLPTraceExporter({ url: `${config.endpoint}/v1/traces` })),
    ],
  });
  // Global tracer provider, AsyncLocalStorage context manager and W3C trace-context propagator.
  tracerProvider.register();

  const meterProvider = new MeterProvider({
    resource,
    readers: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({ url: `${config.endpoint}/v1/metrics` }),
        exportIntervalMillis: config.metricExportIntervalMs,
      }),
    ],
  });
  metrics.setGlobalMeterProvider(meterProvider);

  const loggerProvider = new LoggerProvider({
    resource,
    processors: [
      new BatchLogRecordProcessor({
        exporter: new OTLPLogExporter({ url: `${config.endpoint}/v1/logs` }),
      }),
    ],
  });

  registerInstrumentations({ instrumentations, tracerProvider, meterProvider });

  return {
    logSink: createOtelLogSink(loggerProvider),
    shutdown: async () => {
      await Promise.all([
        tracerProvider.shutdown(),
        meterProvider.shutdown(),
        loggerProvider.shutdown(),
      ]);
    },
  };
};
