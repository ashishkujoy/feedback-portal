import { z } from 'zod';

/** Tuple form, for consumers that need the literal list (e.g. the Postgres enum). */
export const batchMemberRoles = ['mentor', 'program_manager'] as const;

export const BatchMemberRole = z.enum(batchMemberRoles);
export type BatchMemberRole = z.infer<typeof BatchMemberRole>;
