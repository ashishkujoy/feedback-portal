import { z } from 'zod';

export const InternStatus = z.enum(['active', 'on_notice', 'graduated', 'terminated', 'withdrawn']);
export type InternStatus = z.infer<typeof InternStatus>;

export const finalInternStatuses: ReadonlySet<InternStatus> = new Set<InternStatus>([
  'graduated',
  'terminated',
  'withdrawn',
]);

/** A final status is terminal: the intern record becomes read-only. */
export const isFinalStatus = (status: InternStatus): boolean => finalInternStatuses.has(status);
