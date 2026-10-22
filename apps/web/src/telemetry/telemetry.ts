import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  BatchSpanProcessor,
  type SpanProcessor,
  WebTracerProvider,
} from '@opentelemetry/sdk-trace-web';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

export const serviceName = 'feedback-portal-web';

/** The exporter's own requests; tracing them would trace every export. */
const otlpPath = /\/otlp\//;

type TelemetryOptions = Readonly<{
  tracesUrl: string;
  /** Tests swap the OTLP batch exporter for an in-memory one. */
  spanProcessor?: SpanProcessor;
}>;

/**
 * Traces every `fetch`. Same-origin requests (all of `/api`) carry `traceparent`, so the API's
 * spans join the browser's trace. Returns a function that undoes it (for tests).
 */
export const startTelemetry = ({ tracesUrl, spanProcessor }: TelemetryOptions) => {
  const provider = new WebTracerProvider({
    resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: serviceName }),
    spanProcessors: [
      spanProcessor ?? new BatchSpanProcessor(new OTLPTraceExporter({ url: tracesUrl })),
    ],
  });
  // Global tracer provider, W3C trace-context propagator and the default context manager.
  provider.register();
  const disable = registerInstrumentations({
    tracerProvider: provider,
    instrumentations: [new FetchInstrumentation({ ignoreUrls: [otlpPath] })],
  });
  return async () => {
    disable();
    await provider.shutdown();
  };
};
