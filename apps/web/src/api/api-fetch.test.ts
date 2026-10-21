import { z } from 'zod';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, apiSend } from './api-fetch.ts';
import { ApiContractError, ApiError, isApiError } from './errors.ts';

const Thing = z.object({ id: z.string() });

const respond = (response: Response | Error) => {
  const fetchMock = vi.fn<typeof fetch>(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const json = (body: unknown, status = 200, contentType = 'application/json') =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': contentType } });

const caught = async (promise: Promise<unknown>): Promise<unknown> => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected the call to fail');
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiFetch', () => {
  it('calls /api with the session cookie and parses the success', async () => {
    const fetchMock = respond(json({ id: 'a', extra: true }));
    const signal = new AbortController().signal;

    expect(await apiFetch('/things/a', { schema: Thing, signal })).toEqual({ id: 'a' });
    expect(fetchMock).toHaveBeenCalledWith('/api/things/a', {
      method: 'GET',
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
      signal,
    });
  });

  it('sends a JSON body with its content type', async () => {
    const fetchMock = respond(json({ id: 'b' }, 201));

    await apiFetch('/things', { schema: Thing, method: 'POST', body: { name: 'B' } });

    expect(fetchMock).toHaveBeenCalledWith('/api/things', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: '{"name":"B"}',
    });
  });

  it('throws ApiContractError for a success the contract rejects', async () => {
    respond(json({ id: 42 }));

    const error = await caught(apiFetch('/things/a', { schema: Thing }));

    expect(error).toBeInstanceOf(ApiContractError);
    expect(error).toMatchObject({ path: '/things/a', issues: [{ path: ['id'] }] });
  });

  it('throws ApiError with every field of a problem response', async () => {
    respond(
      json(
        {
          type: 'about:blank',
          title: 'Conflict',
          status: 409,
          code: 'email_taken',
          detail: 'A user with this email already exists',
          requestId: 'req-9',
          errors: [{ path: 'email', message: 'taken' }],
        },
        409,
        'application/problem+json',
      ),
    );

    const error = await caught(apiFetch('/users', { schema: Thing, method: 'POST', body: {} }));

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 409,
      code: 'email_taken',
      detail: 'A user with this email already exists',
      requestId: 'req-9',
      errors: [{ path: 'email', message: 'taken' }],
      message: 'A user with this email already exists',
    });
    expect(isApiError(error, 'email_taken')).toBe(true);
    expect(isApiError(error, 'conflict')).toBe(false);
  });

  it('turns a non-problem failure (an HTML 502 from a proxy) into internal', async () => {
    respond(new Response('<html>Bad gateway</html>', { status: 502 }));

    expect(await caught(apiFetch('/me', { schema: Thing }))).toMatchObject({
      status: 502,
      code: 'internal',
    });
  });

  it('turns a network failure into unavailable', async () => {
    respond(new TypeError('Failed to fetch'));

    expect(await caught(apiFetch('/me', { schema: Thing }))).toMatchObject({
      status: 0,
      code: 'unavailable',
    });
  });

  it('lets an abort through unchanged', async () => {
    const controller = new AbortController();
    controller.abort();
    const abort = Object.assign(new Error('Aborted'), { name: 'AbortError' });
    respond(abort);

    expect(await caught(apiFetch('/me', { schema: Thing, signal: controller.signal }))).toBe(abort);
  });
});

describe('apiSend', () => {
  it('resolves on 204 and sends no content type without a body', async () => {
    const fetchMock = respond(new Response(null, { status: 204 }));

    await expect(apiSend('/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
    });
  });

  it('throws ApiError on failure', async () => {
    respond(
      json(
        { type: 'about:blank', title: 'Forbidden', status: 403, code: 'forbidden', requestId: 'r' },
        403,
        'application/problem+json',
      ),
    );

    expect(await caught(apiSend('/auth/logout', { method: 'POST' }))).toMatchObject({
      status: 403,
      code: 'forbidden',
    });
  });
});
