import type { Batch } from '../domain/batch.ts';
import type { BatchId } from '../domain/batch-id.ts';

/** Persistence for the `Batch` aggregate, its member history included. Nothing is deleted. */
export type BatchRepository = Readonly<{
  findById: (id: BatchId) => Promise<Batch | null>;
  /** Creates or updates the batch; adds new assignments and records ended ones. Throws `batch_name_taken`. */
  save: (batch: Batch) => Promise<void>;
}>;
