import type { ExistingIntern } from './import-preview.ts';
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
  /** The storage's id for the photo; the HTTP layer turns it into a URL. */
  photoPublicId: string | null;
}>;

type ActorRef = Readonly<{ id: string; name: string }>;

export type InternStatusEventView = Readonly<{
  id: string;
  fromStatus: InternStatus | null;
  toStatus: InternStatus;
  reason: string | null;
  noticeStartsOn: string | null;
  noticeEndsOn: string | null;
  /** The feedback that gave this notice; `null` for any other change. */
  feedbackId: string | null;
  actor: ActorRef;
  createdAt: Date;
}>;

/** The profile: details, how the intern arrived, and the history newest first. */
export type InternDetailView = InternSummaryView &
  Readonly<{
    phone: string | null;
    diplomaBranch: string | null;
    parentNames: string | null;
    interviewNotes: string | null;
    source: 'manual' | 'airtable';
    createdAt: Date;
    addedBy: ActorRef;
    statusEvents: readonly InternStatusEventView[];
  }>;

/** Reads for the screens; access is checked by the use cases. */
export type InternQueries = Readonly<{
  /** The batch's interns, by name ignoring case. */
  listForBatch: (batchId: BatchId) => Promise<readonly InternSummaryView[]>;
  /** Every intern of the batch, for matching an import by username. */
  usernamesForBatch: (batchId: BatchId) => Promise<readonly ExistingIntern[]>;
  /** One intern of that batch; `null` if there's none with that id in it. */
  detail: (batchId: BatchId, internId: string) => Promise<InternDetailView | null>;
}>;
