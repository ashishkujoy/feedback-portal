import type { ProblemDetails } from '@feedback-portal/contracts';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { AppEnv } from './app-env.ts';

const titles: Readonly<Record<number, string>> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  500: 'Internal Server Error',
};

type ProblemInput = Omit<ProblemDetails, 'type' | 'title' | 'requestId' | 'status'> & {
  status: ContentfulStatusCode;
};

/** Writes an RFC 9457 problem response, tagged with the current request ID. */
export const problemResponse = (c: Context<AppEnv>, problem: ProblemInput): Response => {
  const body: ProblemDetails = {
    type: 'about:blank',
    title: titles[problem.status] ?? 'Error',
    ...problem,
    requestId: c.get('requestId'),
  };
  return c.body(JSON.stringify(body), problem.status, {
    'content-type': 'application/problem+json',
  });
};
