import { ProblemDetails } from '@feedback-portal/contracts';
import type { z } from 'zod';
import { ApiContractError, ApiError } from './errors.ts';

/** Every API call goes through this origin; Vite (dev) and nginx (production) forward it. */
const apiPrefix = '/api';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

type ApiFetchOptions = Readonly<{
  method?: Method;
  /** JSON-encoded; omit for bodyless requests. */
  body?: unknown;
  signal?: AbortSignal;
}>;

const readJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
};

const failure = async (response: Response): Promise<ApiError> => {
  const problem = ProblemDetails.safeParse(await readJson(response));
  if (!problem.success) return new ApiError({ status: response.status, code: 'internal' });
  const { code, detail, errors, requestId } = problem.data;
  return new ApiError({ status: response.status, code, detail, errors, requestId });
};

const send = async (path: string, { method = 'GET', body, signal }: ApiFetchOptions) => {
  try {
    return await fetch(`${apiPrefix}${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    if (signal?.aborted) throw error; // let Query see its own cancellation
    throw new ApiError({
      status: 0,
      code: 'unavailable',
      detail: 'The server could not be reached',
    });
  }
};

/**
 * Calls the API at `path` (e.g. `/me`) with the session cookie and parses the success with
 * `schema`. Throws `ApiError` for any failure and `ApiContractError` for a success the contract
 * rejects.
 */
export const apiFetch = async <S extends z.ZodType>(
  path: string,
  { schema, ...options }: ApiFetchOptions & Readonly<{ schema: S }>,
): Promise<z.output<S>> => {
  const response = await send(path, options);
  if (!response.ok) throw await failure(response);
  const parsed = schema.safeParse(await readJson(response));
  if (!parsed.success) throw new ApiContractError(path, parsed.error.issues);
  return parsed.data;
};

/** For calls whose success has no body (204), e.g. logout. Throws `ApiError` on failure. */
export const apiSend = async (path: string, options: ApiFetchOptions = {}): Promise<void> => {
  const response = await send(path, options);
  if (!response.ok) throw await failure(response);
};
