import type { ValidationTargets } from 'hono';
import { validator } from 'hono/validator';
import type { z } from 'zod';
import { validationFailed } from '../errors/app-error.ts';
import { fieldIssues } from '../errors/field-issues.ts';

/**
 * Validates a request part with a Zod schema; on failure throws `validationFailed` with field
 * paths and messages only (never the received values). Read the result via `c.req.valid(target)`.
 */
export const validate = <S extends z.ZodType>(target: keyof ValidationTargets, schema: S) =>
  validator(target, async (value): Promise<z.output<S>> => {
    const result = await schema.safeParseAsync(value);
    if (result.success) return result.data;
    throw validationFailed(fieldIssues(result.error));
  });
