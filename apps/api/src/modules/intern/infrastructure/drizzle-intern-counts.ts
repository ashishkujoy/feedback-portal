import type { ColorCode } from '@feedback-portal/contracts';
import { count, inArray, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../../shared/db/client.ts';
import type { InternCounts, InternCountsView } from '../../cohort/application/intern-counts.ts';
import { interns } from './schema.ts';

const statusCount = (status: 'on_notice' | 'terminated') =>
  sql<number>`count(*) filter (where ${interns.status} = ${status})`.mapWith(Number);

const colourCount = (code: ColorCode | null) =>
  (code === null
    ? sql<number>`count(*) filter (where ${interns.colorCode} is null)`
    : sql<number>`count(*) filter (where ${interns.colorCode} = ${code})`
  ).mapWith(Number);

/** Cohort's `InternCounts` port: one grouped query for all the batches asked about. */
export const createInternCounts =
  (db: DbExecutor): InternCounts =>
  async (batchIds) => {
    if (batchIds.length === 0) return new Map();
    const rows = await db
      .select({
        batchId: interns.batchId,
        total: count(),
        onNotice: statusCount('on_notice'),
        terminated: statusCount('terminated'),
        green: colourCount('green'),
        yellow: colourCount('yellow'),
        borderline_yellow: colourCount('borderline_yellow'),
        orange: colourCount('orange'),
        borderline_red: colourCount('borderline_red'),
        red: colourCount('red'),
        none: colourCount(null),
      })
      .from(interns)
      .where(inArray(interns.batchId, [...batchIds]))
      .groupBy(interns.batchId);
    return new Map(
      rows.map(
        ({ batchId, total, onNotice, terminated, ...colours }): [string, InternCountsView] => [
          batchId,
          { total, onNotice, terminated, colours },
        ],
      ),
    );
  };
