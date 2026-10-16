// Preload: `node --import ./src/instrumentation.ts src/main.ts`.
// Instrumentation has to patch `pg` and `node:http` before the app imports them, and an ESM
// loader hook only affects modules loaded after it is registered — too late from main.ts.
import { register } from 'node:module';
import { createAddHookMessageChannel } from 'import-in-the-middle';
import { loadConfigOrExit } from './shared/config/load-config-or-exit.ts';
import { setTelemetry } from './shared/telemetry/handle.ts';

const config = loadConfigOrExit();

if (config.telemetry.enabled) {
  // Hooks only the modules the instrumentations ask for, not every import.
  const { registerOptions, waitForAllMessagesAcknowledged } = createAddHookMessageChannel();
  register('import-in-the-middle/hook.mjs', import.meta.url, registerOptions);

  const { createInstrumentations, startTelemetry } =
    await import('./shared/telemetry/telemetry.ts');
  setTelemetry(startTelemetry(config.telemetry, config.env, createInstrumentations()));
  await waitForAllMessagesAcknowledged();
}
