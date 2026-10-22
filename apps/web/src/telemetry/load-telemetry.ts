/**
 * Starts browser tracing when the build sets `VITE_OTEL_TRACES_URL`. The SDK is a separate chunk,
 * so builds without it don't ship it.
 */
export const loadTelemetry = async (tracesUrl: string | undefined): Promise<void> => {
  if (!tracesUrl) return;
  const { startTelemetry } = await import('./telemetry.ts');
  startTelemetry({ tracesUrl });
};
