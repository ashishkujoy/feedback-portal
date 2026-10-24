import { z } from 'zod';

/**
 * Where to import from: typed in for each import, and **the token is never stored** (8.1). The
 * same rules as the API's Airtable adapter, so the form can check them first.
 */
export const ImportSourceRequest = z.object({
  token: z.string().trim().min(1, { error: 'Enter an API key' }),
  baseId: z
    .string()
    .trim()
    .regex(/^app[A-Za-z0-9]{14}$/, { error: 'A base ID starts with "app"' }),
  tableId: z
    .string()
    .trim()
    .regex(/^tbl[A-Za-z0-9]{14}$/, { error: 'A table ID starts with "tbl"' }),
  view: z
    .string()
    .trim()
    .min(1, { error: 'Enter a view name' })
    .max(200, { error: 'View name must be at most 200 characters' }),
});
export type ImportSourceRequest = z.input<typeof ImportSourceRequest>;

const PreviewRow = z.object({ row: z.int().positive(), username: z.string(), name: z.string() });

/** `POST /batches/:batchId/imports/preview`: what an import would do; nothing is written. */
export const ImportPreview = z.object({
  recordCount: z.int().nonnegative(),
  counts: z.object({
    new: z.int().nonnegative(),
    updated: z.int().nonnegative(),
    invalid: z.int().nonnegative(),
  }),
  new: z.array(PreviewRow),
  updated: z.array(PreviewRow.extend({ internId: z.uuid() })),
  invalid: z.array(
    z.object({
      row: z.int().positive(),
      username: z.string().nullable(),
      reasons: z.array(z.string()).min(1),
    }),
  ),
});
export type ImportPreview = z.infer<typeof ImportPreview>;
