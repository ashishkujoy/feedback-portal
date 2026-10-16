import { describe, expect, it } from 'vitest';
import { isUniqueViolation, pgErrorOf } from './pg-error.ts';

const driverError = (code: string, constraint?: string) =>
  Object.assign(new Error('driver'), { code, constraint });
const wrapped = (cause: unknown) => new Error('Failed query', { cause });

describe('pgErrorOf', () => {
  it('reads code and constraint from the wrapped driver error', () => {
    expect(pgErrorOf(wrapped(driverError('23505', 'users_email_unique')))).toEqual({
      code: '23505',
      constraint: 'users_email_unique',
    });
  });

  it('reads an unwrapped driver error', () => {
    expect(pgErrorOf(driverError('23503'))).toEqual({ code: '23503', constraint: undefined });
  });

  it.each([
    ['a plain error', new Error('boom')],
    ['a Node system error code', Object.assign(new Error('x'), { code: 'ECONNREFUSED' })],
    ['a non-error', 'nope'],
  ])('returns undefined for %s', (_, error) => {
    expect(pgErrorOf(error)).toBeUndefined();
  });
});

describe('isUniqueViolation', () => {
  it('matches only the named constraint', () => {
    const error = wrapped(driverError('23505', 'users_email_unique'));

    expect(isUniqueViolation(error, 'users_email_unique')).toBe(true);
    expect(isUniqueViolation(error, 'users_google_sub_unique')).toBe(false);
    expect(
      isUniqueViolation(wrapped(driverError('23503', 'users_email_unique')), 'users_email_unique'),
    ).toBe(false);
  });
});
