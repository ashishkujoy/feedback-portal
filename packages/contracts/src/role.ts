import { z } from 'zod';

/** Tuple form, for consumers that need the literal list (e.g. the Postgres enum). */
export const roles = ['admin', 'mentor', 'program_manager'] as const;

export const Role = z.enum(roles);
export type Role = z.infer<typeof Role>;
