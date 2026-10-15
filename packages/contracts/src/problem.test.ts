import { describe, expect, it } from 'vitest';
import { ErrorCode, ProblemDetails } from './problem.ts';

const base = {
  type: 'about:blank',
  title: 'Not Found',
  status: 404,
  code: 'not_found',
  requestId: 'r1',
};

describe('ProblemDetails', () => {
  it('accepts the minimal shape', () => {
    expect(ProblemDetails.parse(base)).toEqual(base);
  });

  it('accepts detail and field errors', () => {
    const problem = {
      ...base,
      status: 400,
      code: 'validation_failed',
      detail: 'Request validation failed',
      errors: [{ path: 'name', message: 'required' }],
    };
    expect(ProblemDetails.parse(problem)).toEqual(problem);
  });

  it('rejects unknown codes and non-error statuses', () => {
    expect(ProblemDetails.safeParse({ ...base, code: 'oops' }).success).toBe(false);
    expect(ProblemDetails.safeParse({ ...base, status: 200 }).success).toBe(false);
  });

  it('defines the error codes', () => {
    expect(ErrorCode.options).toEqual([
      'validation_failed',
      'unauthenticated',
      'forbidden',
      'not_found',
      'conflict',
      'internal',
      'unavailable',
    ]);
  });
});
