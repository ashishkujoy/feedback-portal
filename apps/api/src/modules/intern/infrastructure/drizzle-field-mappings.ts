import { FieldMapping } from '@feedback-portal/contracts';
import { desc, eq } from 'drizzle-orm';
import type { DbExecutor } from '../../../shared/db/client.ts';
import type { FieldMappings } from '../application/field-mappings.ts';
import { airtableFieldMappings } from './schema.ts';

/** A stored mapping, checked again on the way out: one that no longer parses counts as none. */
const parsed = (row: Readonly<{ mapping: unknown }> | undefined): FieldMapping | null => {
  const result = FieldMapping.safeParse(row?.mapping);
  return result.success ? result.data : null;
};

export const createFieldMappings = (db: DbExecutor): FieldMappings => ({
  forBatch: async (batchId) => {
    const [row] = await db
      .select({ mapping: airtableFieldMappings.mapping })
      .from(airtableFieldMappings)
      .where(eq(airtableFieldMappings.batchId, batchId));
    return parsed(row);
  },

  latest: async () => {
    const [row] = await db
      .select({ mapping: airtableFieldMappings.mapping })
      .from(airtableFieldMappings)
      .orderBy(desc(airtableFieldMappings.updatedAt))
      .limit(1);
    return parsed(row);
  },

  save: async ({ batchId, mapping, by, at }) => {
    await db
      .insert(airtableFieldMappings)
      .values({ batchId, mapping, updatedBy: by, updatedAt: at })
      .onConflictDoUpdate({
        target: airtableFieldMappings.batchId,
        set: { mapping, updatedBy: by, updatedAt: at },
      });
  },
});
