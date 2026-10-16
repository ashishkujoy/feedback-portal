import { describe, expect, it } from 'vitest';
import { AppError } from '../../../shared/errors/app-error.ts';
import { parseEmail } from './email.ts';

const issuesOf = (input: string): unknown => {
  try {
    parseEmail(input);
  } catch (error) {
    if (error instanceof AppError) return { code: error.code, issues: error.issues };
    throw error;
  }
  throw new Error('expected parseEmail to throw');
};

describe('parseEmail', () => {
  it('trims and lower-cases', () => {
    expect(parseEmail('  A.Person@Example.COM ')).toBe('a.person@example.com');
  });

  it.each([
    ['empty', ''],
    ['blank', '   '],
    ['missing @', 'a.person.example.com'],
    [
      'over 254 characters',
      `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(63)}.com`,
    ],
  ])('rejects %s with an issue at email', (_, input) => {
    expect(issuesOf(input)).toEqual({
      code: 'validation_failed',
      issues: [{ path: 'email', message: expect.any(String) }],
    });
  });

  it('never includes the value in the error', () => {
    expect(JSON.stringify(issuesOf('Secret.Person-at-example.com'))).not.toMatch(/secret/i);
  });
});
