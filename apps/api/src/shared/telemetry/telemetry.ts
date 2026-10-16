import { type DiagLogger, DiagLogLevel, diag, metrics } from '@opentelemetry/api';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { type Instrumentation, registerInstrumentations } from '@opentelemetry/instrumentation';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchSpanProcessor, NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { getLogger } from '@logtape/logtape';
import packageJson from '../../../package.json' with { type: 'json' };
import type { Config } from '../config/config.ts';
import { rootCategory } from '../logging/logging.ts';

type EnabledTelemetry = Extract<Config['telemetry'], { enabled: true }>;

export type Telemetry = Readonly<{
  /** Flushes pending spans and metrics, then stops exporting. */
  shutdown: () => Promise<void>;
}>;

// SDK diagnostics (failed exports, misconfiguration) go to LogTape. Records emitted before
// `configureLogging` runs in main.ts are dropped, which only affects start-up.
const otelLogger = getLogger([rootCategory, 'otel']);
const diagLogger: DiagLogger = {
  error: (message, ...args) => otelLogger.error(message, { args }),
  warn: (message, ...args) => otelLogger.warning(message, { args }),
  info: (message, ...args) => otelLogger.info(message, { args }),
  debug: (message, ...args) => otelLogger.debug(message, { args }),
  verbose: (message, ...args) => otelLogger.trace(message, { args }),
};

/** The auto-instrumentations, created before the app imports `pg` or `node:http`. */
export const createInstrumentations = (): Instrumentation[] => [
  new HttpInstrumentation(),
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

  registerInstrumentations({ instrumentations, tracerProvider, meterProvider });

  return {
    shutdown: async () => {
      await Promise.all([tracerProvider.shutdown(), meterProvider.shutdown()]);
    },
  };
};
