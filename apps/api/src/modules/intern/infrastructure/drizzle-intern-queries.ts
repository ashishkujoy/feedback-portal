import { asc, eq, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../../shared/db/client.ts';
import type { InternQueries } from '../application/intern-queries.ts';
import { interns } from './schema.ts';

export const createInternQueries = (db: DbExecutor): InternQueries => ({
  listForBatch: (batchId) =>
    db
      .select({
        id: interns.id,
        batchId: interns.batchId,
        username: interns.username,
        name: interns.name,
        email: interns.email,
        status: interns.status,
        colorCode: interns.colorCode,
        noticeEndsOn: interns.noticeEndsOn,
      })
      .from(interns)
      .where(eq(interns.batchId, batchId))
      .orderBy(sql`lower(${interns.name})`, asc(interns.id)),
});
