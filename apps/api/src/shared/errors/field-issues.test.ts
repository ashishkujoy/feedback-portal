import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { fieldIssues } from './field-issues.ts';

const errorOf = (schema: z.ZodType, value: unknown): z.ZodError => {
  const result = schema.safeParse(value);
  if (result.success) throw new Error('expected a failure');
  return result.error;
};

describe('fieldIssues', () => {
  it('joins nested paths', () => {
    const error = errorOf(z.object({ a: z.object({ b: z.string() }) }), { a: { b: 1 } });

    expect(fieldIssues(error)).toEqual([{ path: 'a.b', message: expect.any(String) }]);
  });

  it('prefixes the field name for a bare value', () => {
    expect(fieldIssues(errorOf(z.string(), 1), 'email')).toEqual([
      { path: 'email', message: expect.any(String) },
    ]);
  });

  it('never includes the received value', () => {
    const [issue] = fieldIssues(errorOf(z.email(), 'secret-value'), 'email');

    expect(JSON.stringify(issue)).not.toContain('secret-value');
  });
});
