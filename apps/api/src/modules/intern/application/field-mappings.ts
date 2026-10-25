import type { FieldMapping } from '@feedback-portal/contracts';

/** Each batch's saved Airtable field mapping (8.6). */
export type FieldMappings = Readonly<{
  /** The batch's mapping; `null` when it has none (or it no longer reads as one). */
  forBatch: (batchId: string) => Promise<FieldMapping | null>;
  /** The mapping saved most recently by any batch, for a batch with none of its own. */
  latest: () => Promise<FieldMapping | null>;
  save: (
    saved: Readonly<{ batchId: string; mapping: FieldMapping; by: string; at: Date }>,
  ) => Promise<void>;
}>;
