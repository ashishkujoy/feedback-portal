import {
  ImportColumns,
  ImportPreview,
  type ImportRequest,
  ImportResult,
  type ImportSourceRequest,
} from '@feedback-portal/contracts';
import { apiFetch } from './api-fetch.ts';

// Mutations only: the source holds the API key, so it never goes into a query key or cache.

/** `POST …/imports/columns` (the batch's managers): the view's columns and a mapping to start from. */
export const listImportColumns = (batchId: string, body: ImportSourceRequest) =>
  apiFetch(`/batches/${batchId}/imports/columns`, { method: 'POST', body, schema: ImportColumns });

/** `POST …/imports/preview` (the batch's managers): what an import would do; nothing is written. */
export const previewImport = (batchId: string, body: ImportRequest) =>
  apiFetch(`/batches/${batchId}/imports/preview`, { method: 'POST', body, schema: ImportPreview });

/** `POST …/imports` (the batch's managers): reads Airtable again and imports, all or nothing. */
export const runImport = (batchId: string, body: ImportRequest) =>
  apiFetch(`/batches/${batchId}/imports`, { method: 'POST', body, schema: ImportResult });
