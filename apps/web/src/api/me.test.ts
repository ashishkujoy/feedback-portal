import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { shouldRetry } from '../app/query-client.ts';
import { signedOut, stubApi } from '../test/stub-api.ts';
import { ApiError } from './errors.ts';
import { meQuery } from './me.ts';

const me = {
  id: '01890a5d-ac96-774b-bcce-b302099a8057',
  email: 'mentor@example.com',
  name: 'A Mentor',
  avatarUrl: null,
  roles: ['mentor'],
};

const fetchMe = () => new QueryClient().fetchQuery({ ...meQuery, retry: false });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('meQuery', () => {
  it('returns the signed-in user', async () => {
    stubApi({ '/me': { status: 200, body: me } });

    expect(await fetchMe()).toEqual(me);
  });

  it('returns null when signed out', async () => {
    stubApi(signedOut);

    expect(await fetchMe()).toBeNull();
  });

  it('fails on any other error', async () => {
    stubApi({
      '/me': {
        status: 500,
        contentType: 'application/problem+json',
        body: {
          type: 'about:blank',
          title: 'Error',
          status: 500,
          code: 'internal',
          requestId: 'r',
        },
      },
    });

    await expect(fetchMe()).rejects.toMatchObject({ status: 500, code: 'internal' });
  });
});

describe('shouldRetry', () => {
  it.each([401, 403, 404, 409])('never retries a %i', (status) => {
    expect(shouldRetry(0, new ApiError({ status, code: 'conflict' }))).toBe(false);
  });

  it('retries a server error, an unreachable API or anything else once', () => {
    for (const error of [
      new ApiError({ status: 503, code: 'unavailable' }),
      new ApiError({ status: 0, code: 'unavailable' }),
      new Error('bug'),
    ]) {
      expect([shouldRetry(0, error), shouldRetry(1, error)]).toEqual([true, false]);
    }
  });
});
