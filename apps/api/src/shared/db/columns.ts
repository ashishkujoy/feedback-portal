import { colorCodes } from '@feedback-portal/contracts';
import { customType, pgEnum } from 'drizzle-orm/pg-core';

/** Case-insensitive text (`citext` extension, created by migration 0000_baseline). */
export const citext = customType<{ data: string }>({ dataType: () => 'citext' });

/**
 * How an intern is performing; `NULL` means "no colour code yet". Shared by interns (the current
 * code) and feedback (the code it sets), whose schemas refer to each other.
 */
export const colorCodeEnum = pgEnum('color_code', colorCodes);
