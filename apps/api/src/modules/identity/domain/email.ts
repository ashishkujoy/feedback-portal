import { z } from 'zod';
import { validationFailed } from '../../../shared/errors/app-error.ts';
import { fieldIssues } from '../../../shared/errors/field-issues.ts';

/** A trimmed, lower-cased, valid email address. Only `Email` / `parseEmail` can produce one. */
export const Email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(
    z
      .email({ error: 'Invalid email address' })
      .max(254, { error: 'Email must be at most 254 characters' }),
  )
  .brand<'Email'>();
export type Email = z.infer<typeof Email>;

export const parseEmail = (input: string): Email => {
  const result = Email.safeParse(input);
  if (result.success) return result.data;
  throw validationFailed(fieldIssues(result.error, 'email'));
};
