import type { ErrorCode } from '@feedback-portal/contracts';
import { getLogger } from '@logtape/logtape';
import type { Context, ErrorHandler, NotFoundHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { HTTPException } from 'hono/http-exception';
import { AppError, type ErrorKind } from '../errors/app-error.ts';
import { rootCategory } from '../logging/logging.ts';
import type { AppEnv } from './app-env.ts';
import { problemResponse } from './problem.ts';

const logger = getLogger([rootCategory, 'http']);

const statusFor = (kind: ErrorKind): ContentfulStatusCode => {
  switch (kind) {
    case 'validation':
      return 400;
    case 'unauthenticated':
      return 401;
    case 'forbidden':
      return 403;
    case 'not_found':
      return 404;
    case 'conflict':
      return 409;
  }
};

const codesByStatus: Readonly<Record<number, ErrorCode>> = {
  400: 'validation_failed',
  401: 'unauthenticated',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
};

const internalError = (c: Context<AppEnv>, error: unknown): Response => {
  logger.error('unhandled error: {error}', { requestId: c.get('requestId'), error });
  return problemResponse(c, { status: 500, code: 'internal' });
};

/** Maps thrown errors to problem responses. Only `AppError`/4xx details reach the client. */
export const errorHandler: ErrorHandler<AppEnv> = (error, c) => {
  if (error instanceof AppError) {
    return problemResponse(c, {
      status: statusFor(error.kind),
      code: error.code,
      detail: error.message,
      ...(error.issues ? { errors: [...error.issues] } : {}),
    });
  }
  // Hono's own 4xx (e.g. malformed JSON from the validator); its messages are generic.
  if (error instanceof HTTPException && error.status < 500) {
    return problemResponse(c, {
      status: error.status,
      code: codesByStatus[error.status] ?? 'validation_failed',
      detail: error.message,
    });
  }
  return internalError(c, error);
};

export const notFoundHandler: NotFoundHandler<AppEnv> = (c) =>
  problemResponse(c, { status: 404, code: 'not_found', detail: `No route for ${c.req.path}` });
