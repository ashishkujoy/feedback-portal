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
    .regex(/^app[A-Za-z0-9]{14}$/, { error: 'Base IDs start with “app”' }),
  tableId: z
    .string()
    .trim()
    .regex(/^tbl[A-Za-z0-9]{14}$/, { error: 'Table IDs start with “tbl”' }),
  view: z
    .string()
    .trim()
    .min(1, { error: 'Enter a view name' })
    .max(200, { error: 'View name must be at most 200 characters' }),
});
export type ImportSourceRequest = z.input<typeof ImportSourceRequest>;

/** An Airtable column, by its name in the view. */
const Column = z.string().trim().min(1).max(200);

/** Where the username comes from: a column, or the part of the email before the @ (8.6). */
export const UsernameSource = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('column'), column: Column }),
  z.object({ kind: z.literal('fromEmail') }),
]);
export type UsernameSource = z.infer<typeof UsernameSource>;

/** The intern fields an import fills, in the order the Fields step lists them. */
export const mappedFields = [
  'username',
  'name',
  'email',
  'phone',
  'diplomaBranch',
  'parentNames',
  'interviewNotes',
] as const;
export type MappedField = (typeof mappedFields)[number];

/**
 * Which column fills each intern field (8.6), saved per batch when an import runs. Optional fields
 * are `null` when not imported.
 */
export const FieldMapping = z.object({
  username: UsernameSource,
  name: Column,
  email: Column,
  phone: Column.nullable(),
  diplomaBranch: Column.nullable(),
  parentNames: Column.nullable(),
  interviewNotes: Column.nullable(),
});
export type FieldMapping = z.infer<typeof FieldMapping>;

/** `POST …/imports/preview` and `POST …/imports`: the source and the mapping to use. */
export const ImportRequest = ImportSourceRequest.extend({ mapping: FieldMapping });
export type ImportRequest = z.input<typeof ImportRequest>;

/**
 * `POST …/imports/columns` (8.6): the view's columns (first seen first) and the mapping to start
 * from: the batch's saved one, else the latest saved by any batch, else the defaults. A field is
 * `null` where nothing in the view fits; `missing` names saved columns the view no longer has.
 */
export const ImportColumns = z.object({
  recordCount: z.int().nonnegative(),
  columns: z.array(z.string()),
  mapping: z.object({
    username: UsernameSource.nullable(),
    name: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    diplomaBranch: z.string().nullable(),
    parentNames: z.string().nullable(),
    interviewNotes: z.string().nullable(),
  }),
  missing: z.array(z.object({ field: z.enum(mappedFields), column: z.string() })),
});
export type ImportColumns = z.infer<typeof ImportColumns>;

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

/** `POST /batches/:batchId/imports`: what the run did (v2 A10-result). */
export const ImportResult = z.object({
  importId: z.uuid(),
  counts: z.object({
    created: z.int().nonnegative(),
    updated: z.int().nonnegative(),
    skipped: z.int().nonnegative(),
  }),
  invalid: z.array(
    z.object({
      row: z.int().positive(),
      username: z.string().nullable(),
      reasons: z.array(z.string()).min(1),
    }),
  ),
});
export type ImportResult = z.infer<typeof ImportResult>;
