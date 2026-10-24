import type { ColorCode, InternStatus } from '@feedback-portal/contracts';
import type { BatchId } from '../../cohort/domain/batch-id.ts';

/** An intern as the roster shows them. */
export type InternSummaryView = Readonly<{
  id: string;
  batchId: string;
  username: string;
  name: string;
  email: string;
  status: InternStatus;
  colorCode: ColorCode | null;
  noticeEndsOn: string | null;
}>;

/** Reads for the screens; access is checked by the use cases. */
export type InternQueries = Readonly<{
  /** The batch's interns, by name ignoring case. */
  listForBatch: (batchId: BatchId) => Promise<readonly InternSummaryView[]>;
}>;
