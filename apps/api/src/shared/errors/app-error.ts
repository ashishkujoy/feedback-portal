import type { ErrorCode, FieldIssue } from '@feedback-portal/contracts';

/** What went wrong, independent of transport. The HTTP layer maps each kind to a status. */
export type ErrorKind = 'validation' | 'unauthenticated' | 'forbidden' | 'not_found' | 'conflict';

const defaultCodes = {
  validation: 'validation_failed',
  unauthenticated: 'unauthenticated',
  forbidden: 'forbidden',
  not_found: 'not_found',
  conflict: 'conflict',
} as const satisfies Record<ErrorKind, ErrorCode>;

type AppErrorOptions = Readonly<{ code?: ErrorCode; issues?: readonly FieldIssue[] }>;

/**
 * An expected failure with a message that is safe to show the client.
 * A class (unlike the rest of the code) so `instanceof` works; create via the factories below.
 */
export class AppError extends Error {
  readonly kind: ErrorKind;
  readonly code: ErrorCode;
  readonly issues: readonly FieldIssue[] | undefined;

  constructor(kind: ErrorKind, detail: string, options: AppErrorOptions = {}) {
    super(detail);
    this.name = 'AppError';
    this.kind = kind;
    this.code = options.code ?? defaultCodes[kind];
    this.issues = options.issues;
  }
}

export const validationFailed = (issues: readonly FieldIssue[]): AppError =>
  new AppError('validation', 'Request validation failed', { issues });

export const unauthenticated = (detail = 'Authentication required'): AppError =>
  new AppError('unauthenticated', detail);

export const forbidden = (detail: string): AppError => new AppError('forbidden', detail);

export const notFound = (detail: string): AppError => new AppError('not_found', detail);

/** Also used for domain invariant violations, e.g. an illegal status transition. */
export const conflict = (detail: string, code?: ErrorCode): AppError =>
  new AppError('conflict', detail, code ? { code } : {});
