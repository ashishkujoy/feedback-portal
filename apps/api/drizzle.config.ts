import { defineConfig } from 'drizzle-kit';

// Used only by `pnpm db:generate`; migrations are applied by `pnpm db:migrate` (our own script).
export default defineConfig({
  dialect: 'postgresql',
  // Shared column types + one schema file per bounded context (tables arrive from 3.1).
  schema: ['./src/shared/db/columns.ts', './src/modules/*/infrastructure/schema.ts'],
  out: './drizzle',
  casing: 'snake_case',
});
