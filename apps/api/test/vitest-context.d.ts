// Typing for values passed from `global-setup.ts` via `project.provide()` to `inject()`.
// The re-export makes this file a module, so the block below augments 'vitest' instead of replacing it.
export type { ProvidedContext } from 'vitest';

declare module 'vitest' {
  interface ProvidedContext {
    /** Connection URL for the `postgres` maintenance DB of the test container. */
    pgAdminUrl: string;
  }
}
