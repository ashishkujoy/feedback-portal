import { eq } from 'drizzle-orm';
import type { DbExecutor } from '../../../shared/db/client.ts';
import type { ImportRuns } from '../application/import-runs.ts';
import { airtableImports } from './schema.ts';

export const createImportRuns = (db: DbExecutor): ImportRuns => ({
  start: async (run) => {
    await db.insert(airtableImports).values({ ...run, status: 'pending' });
  },

  complete: async (id, { errors, ...counts }) => {
    await db
      .update(airtableImports)
      .set({ ...counts, errors: errors.length > 0 ? errors : null, status: 'completed' })
      .where(eq(airtableImports.id, id));
  },

  fail: async (id, { reason, completedAt }) => {
    await db
      .update(airtableImports)
      .set({ status: 'failed', failureReason: reason, completedAt })
      .where(eq(airtableImports.id, id));
  },
});
