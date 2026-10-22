/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Where the browser posts OTLP/HTTP traces (e.g. `/otlp/v1/traces`); unset turns tracing off. */
  readonly VITE_OTEL_TRACES_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
