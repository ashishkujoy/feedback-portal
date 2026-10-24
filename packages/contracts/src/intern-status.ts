import { z } from 'zod';

/** Tuple form, for consumers that need the literal list (e.g. the Postgres enum). */
export const internStatuses = [
  'active',
  'on_notice',
  'graduated',
  'terminated',
  'withdrawn',
] as const;

export const InternStatus = z.enum(internStatuses);
export type InternStatus = z.infer<typeof InternStatus>;

export const finalInternStatuses: ReadonlySet<InternStatus> = new Set<InternStatus>([
  'graduated',
  'terminated',
  'withdrawn',
]);

/** A final status is terminal: the intern record becomes read-only. */
export const isFinalStatus = (status: InternStatus): boolean => finalInternStatuses.has(status);
