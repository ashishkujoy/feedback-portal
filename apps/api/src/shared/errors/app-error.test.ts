import { describe, expect, it } from 'vitest';
import {
  AppError,
  conflict,
  forbidden,
  notFound,
  unauthenticated,
  validationFailed,
} from './app-error.ts';

describe('AppError factories', () => {
  it.each([
    [forbidden('nope'), 'forbidden', 'forbidden', 'nope'],
    [notFound('missing'), 'not_found', 'not_found', 'missing'],
    [conflict('clash'), 'conflict', 'conflict', 'clash'],
    [unauthenticated(), 'unauthenticated', 'unauthenticated', 'Authentication required'],
  ] as const)('%o has kind %s and code %s', (error, kind, code, message) => {
    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ name: 'AppError', kind, code, message, issues: undefined });
  });

  it('accepts an explicit code on conflict', () => {
    // Specific codes (e.g. invalid_status_transition) are added to ErrorCode by later tasks.
    expect(conflict('bad transition', 'internal').code).toBe('internal');
  });

  it('carries field issues on validation failures', () => {
    const issues = [{ path: 'name', message: 'required' }];

    expect(validationFailed(issues)).toMatchObject({
      kind: 'validation',
      code: 'validation_failed',
      issues,
    });
  });
});
