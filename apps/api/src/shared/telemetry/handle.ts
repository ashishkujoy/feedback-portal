import type { Telemetry } from './telemetry.ts';

// Shared between the preload (`instrumentation.ts`) and `main.ts`, which import the same module
// instance. Without the preload nothing is set and shutdown is a no-op.
let current: Telemetry | undefined;

export const setTelemetry = (telemetry: Telemetry): void => {
  current = telemetry;
};

export const isTelemetryStarted = (): boolean => current !== undefined;

/** OTLP log sink when telemetry started, else `undefined` (logs go to stdout only). */
export const telemetryLogSink = (): Telemetry['logSink'] | undefined => current?.logSink;

export const shutdownTelemetry = async (): Promise<void> => {
  await current?.shutdown();
};
