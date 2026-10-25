import { z } from 'zod';

/** Stable, machine-readable error codes. Clients switch on these, never on `title`/`detail`. */
export const ErrorCode = z.enum([
  'validation_failed',
  'unauthenticated',
  'forbidden',
  'not_found',
  'conflict',
  'internal',
  'unavailable',
  'user_requires_role',
  'cannot_deactivate_self',
  'email_taken',
  'cannot_remove_own_admin',
  'last_admin',
  'batch_archived',
  'member_role_mismatch',
  'member_inactive',
  'batch_requires_pm',
  'batch_name_taken',
  'role_in_use',
  'invalid_status_transition',
  'intern_read_only',
  'intern_username_taken',
  'airtable_source_invalid',
  'airtable_mapping_invalid',
  'airtable_unavailable',
  'intern_not_active',
  'feedback_not_draft',
  'feedback_delivered',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const FieldIssue = z.object({ path: z.string(), message: z.string() });
export type FieldIssue = z.infer<typeof FieldIssue>;

/** RFC 9457 problem details, served as `application/problem+json`. */
export const ProblemDetails = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int().min(400).max(599),
  code: ErrorCode,
  detail: z.string().optional(),
  requestId: z.string(),
  errors: z.array(FieldIssue).optional(),
});
export type ProblemDetails = z.infer<typeof ProblemDetails>;
