import { customType } from 'drizzle-orm/pg-core';

/** Case-insensitive text (`citext` extension, created by migration 0000_baseline). */
export const citext = customType<{ data: string }>({ dataType: () => 'citext' });
