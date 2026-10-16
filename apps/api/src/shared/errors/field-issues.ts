import type { FieldIssue } from '@feedback-portal/contracts';
import type { z } from 'zod';

/**
 * Field paths and messages from a Zod error, never the received values.
 * `at` names the field when the schema validated a bare value (e.g. a single email string).
 */
export const fieldIssues = (error: z.ZodError, at?: string): FieldIssue[] =>
  error.issues.map((issue) => ({
    path: [...(at === undefined ? [] : [at]), ...issue.path].join('.'),
    message: issue.message,
  }));
