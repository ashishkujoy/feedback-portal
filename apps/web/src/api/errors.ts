import type { ErrorCode, FieldIssue } from '@feedback-portal/contracts';
import type { z } from 'zod';

/** A failed API call, from the API's problem+json. Switch on `code`, never on the text. */
export class ApiError extends Error {
  override readonly name = 'ApiError';
  readonly status: number;
  readonly code: ErrorCode;
  readonly detail: string | undefined;
  readonly errors: readonly FieldIssue[];
  readonly requestId: string | undefined;

  constructor(
    init: Readonly<{
      status: number;
      code: ErrorCode;
      detail?: string | undefined;
      errors?: readonly FieldIssue[] | undefined;
      requestId?: string | undefined;
    }>,
  ) {
    super(init.detail ?? `API request failed (${init.status} ${init.code})`);
    this.status = init.status;
    this.code = init.code;
    this.detail = init.detail;
    this.errors = init.errors ?? [];
    this.requestId = init.requestId;
  }
}

/** A success the contract doesn't describe: a bug between the web app and the API. */
export class ApiContractError extends Error {
  override readonly name = 'ApiContractError';
  readonly path: string;
  readonly issues: readonly z.core.$ZodIssue[];

  constructor(path: string, issues: readonly z.core.$ZodIssue[]) {
    super(`Response from ${path} does not match its contract`);
    this.path = path;
    this.issues = issues;
  }
}

export const isApiError = (error: unknown, code?: ErrorCode): error is ApiError =>
  error instanceof ApiError && (code === undefined || error.code === code);
