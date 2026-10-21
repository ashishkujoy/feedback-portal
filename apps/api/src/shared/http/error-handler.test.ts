import { ProblemDetails } from '@feedback-portal/contracts';
import { type LogRecord, reset } from '@logtape/logtape';
import { HTTPException } from 'hono/http-exception';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createBaseApp } from '../../app.ts';
import {
  conflict,
  forbidden,
  notFound,
  unauthenticated,
  unavailable,
} from '../errors/app-error.ts';
import { configureLogging } from '../logging/logging.ts';
import { validate } from './validate.ts';

const secret = 'sentinel-secret-value';

const testApp = () =>
  createBaseApp()
    .post('/items', validate('json', z.object({ name: z.string().min(3), qty: z.number() })), (c) =>
      c.json(c.req.valid('json'), 201),
    )
    .get('/unauthenticated', () => {
      throw unauthenticated();
    })
    .get('/forbidden', () => {
      throw forbidden('You are read-only on this batch');
    })
    .get('/missing', () => {
      throw notFound('Intern not found');
    })
    .get('/conflict', () => {
      throw conflict('Intern is already terminated', 'conflict');
    })
    .get('/unavailable', () => {
      throw unavailable('Google sign-in is not configured');
    })
    .get('/hono-403', () => {
      throw new HTTPException(403, { res: new Response('Forbidden', { status: 403 }) });
    })
    .get('/crash', () => {
      throw new Error(`db password=${secret}`);
    });

const postJson = (body: string) =>
  testApp().request('/items', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });

/** Asserts the problem-JSON contract and returns the parsed body. */
const expectProblem = async (res: Response, status: number): Promise<ProblemDetails> => {
  expect(res.status).toBe(status);
  expect(res.headers.get('content-type')).toBe('application/problem+json');
  const problem = ProblemDetails.parse(await res.json());
  expect(problem.status).toBe(status);
  expect(problem.requestId).toBe(res.headers.get('x-request-id'));
  return problem;
};

describe('error handling', () => {
  let records: LogRecord[];

  beforeEach(async () => {
    records = [];
    await configureLogging({ level: 'trace', format: 'json' }, (record) => records.push(record));
  });

  afterEach(async () => {
    await reset();
  });

  it('passes valid input through the validator', async () => {
    const res = await postJson(JSON.stringify({ name: 'abcd', qty: 2 }));

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ name: 'abcd', qty: 2 });
  });

  it('400: lists field issues without echoing submitted values', async () => {
    const res = await postJson(JSON.stringify({ name: 1, qty: secret }));
    const text = await res.clone().text();

    const problem = await expectProblem(res, 400);
    expect(problem).toMatchObject({
      title: 'Bad Request',
      code: 'validation_failed',
      detail: 'Request validation failed',
    });
    expect(problem.errors?.map((e) => e.path)).toEqual(['name', 'qty']);
    expect(text).not.toContain(secret);
  });

  it('400: malformed JSON', async () => {
    const problem = await expectProblem(await postJson('{"name":'), 400);

    expect(problem.code).toBe('validation_failed');
    expect(problem.errors).toBeUndefined();
  });

  it.each([
    ['/unauthenticated', 401, 'Unauthorized', 'unauthenticated', 'Authentication required'],
    ['/forbidden', 403, 'Forbidden', 'forbidden', 'You are read-only on this batch'],
    ['/missing', 404, 'Not Found', 'not_found', 'Intern not found'],
    ['/conflict', 409, 'Conflict', 'conflict', 'Intern is already terminated'],
    ['/unavailable', 503, 'Service Unavailable', 'unavailable', 'Google sign-in is not configured'],
  ])('%s → %i with the AppError detail', async (path, status, title, code, detail) => {
    const problem = await expectProblem(await testApp().request(path), status);

    expect(problem).toMatchObject({ type: 'about:blank', title, code, detail });
  });

  it('403 from Hono itself (e.g. csrf()): problem+json, without an empty detail', async () => {
    const problem = await expectProblem(await testApp().request('/hono-403'), 403);

    expect(problem.code).toBe('forbidden');
    expect(problem).not.toHaveProperty('detail');
  });

  it('404: unknown route', async () => {
    const problem = await expectProblem(await testApp().request('/does-not-exist'), 404);

    expect(problem).toMatchObject({ code: 'not_found', detail: 'No route for /does-not-exist' });
  });

  it('500: hides the error from the client and logs it once with the requestId', async () => {
    const res = await testApp().request('/crash');
    const text = await res.clone().text();

    const problem = await expectProblem(res, 500);
    expect(problem).toEqual({
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
      code: 'internal',
      requestId: problem.requestId,
    });
    expect(text).not.toContain(secret);

    const errors = records.filter((r) => r.level === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.properties['requestId']).toBe(problem.requestId);
    expect(errors[0]?.properties['error']).toBeInstanceOf(Error);
  });

  it('does not log expected 4xx errors at error level', async () => {
    await testApp().request('/forbidden');

    expect(records.filter((r) => r.level === 'error')).toEqual([]);
  });
});
