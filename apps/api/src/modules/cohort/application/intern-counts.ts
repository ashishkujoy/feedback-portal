import type { BatchId } from '../domain/batch-id.ts';

/** Every intern of a batch, whatever their status; `none` counts those without a colour code. */
export type InternCountsView = Readonly<{
  total: number;
  onNotice: number;
  terminated: number;
  colours: Readonly<{
    green: number;
    yellow: number;
    borderline_yellow: number;
    orange: number;
    borderline_red: number;
    red: number;
    none: number;
  }>;
}>;

/**
 * The intern counts of the given batches; a batch without interns is absent from the map.
 * Implemented by the intern module, so cohort never reads its tables.
 */
export type InternCounts = (
  batchIds: readonly BatchId[],
) => Promise<ReadonlyMap<string, InternCountsView>>;

export const noInterns: InternCountsView = {
  total: 0,
  onNotice: 0,
  terminated: 0,
  colours: {
    green: 0,
    yellow: 0,
    borderline_yellow: 0,
    orange: 0,
    borderline_red: 0,
    red: 0,
    none: 0,
  },
};
