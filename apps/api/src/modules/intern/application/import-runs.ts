/** An invalid row as a run keeps it: never any field value beyond the username. */
export type ImportError = Readonly<{
  row: number;
  username: string | null;
  reasons: readonly string[];
}>;

export type StartedRun = Readonly<{
  id: string;
  batchId: string;
  baseId: string;
  tableId: string;
  view: string;
  importedBy: string;
  createdAt: Date;
}>;

export type CompletedRun = Readonly<{
  recordCount: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  errors: readonly ImportError[];
  completedAt: Date;
}>;

/** The `airtable_imports` record of each run (8.4): pending, then completed or failed. */
export type ImportRuns = Readonly<{
  start: (run: StartedRun) => Promise<void>;
  complete: (id: string, result: CompletedRun) => Promise<void>;
  fail: (id: string, failure: Readonly<{ reason: string; completedAt: Date }>) => Promise<void>;
}>;
