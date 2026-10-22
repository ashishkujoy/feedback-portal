import type { MeResponse, Role } from '@feedback-portal/contracts';
import { vi } from 'vitest';

export type Reply = Readonly<{ status: number; body?: unknown; contentType?: string }>;

export const problem = (status: number, code: string): Reply => ({
  status,
  contentType: 'application/problem+json',
  body: { type: 'about:blank', title: 'Error', status, code, requestId: 'req-1' },
});

/** Neutral names; the real ones only ever come from the API's config. */
export const testSettings = { programName: 'Test Programme', orgName: 'Test Org' };

/** Answers every test gets unless it gives its own. */
const defaults: Record<string, Reply> = { '/settings': { status: 200, body: testSettings } };

/**
 * Canned answers keyed by `"METHOD /path"` or just `"/path"` (any method). Anything else is a 404
 * problem. `/settings` answers with `testSettings` by default. Tests may change `replies` mid-test (e.g. after signing out).
 */
export const stubApi = (replies: Record<string, Reply>) => {
  const fetchMock = vi.fn<typeof fetch>((input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = url.replace(/^\/api/, '');
    const reply =
      replies[`${init?.method ?? 'GET'} ${path}`] ??
      replies[path] ??
      defaults[path] ??
      problem(404, 'not_found');
    return Promise.resolve(
      new Response(reply.body === undefined ? null : JSON.stringify(reply.body), {
        status: reply.status,
        headers: { 'content-type': reply.contentType ?? 'application/json' },
      }),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

export const signedOut: Record<string, Reply> = { '/me': problem(401, 'unauthenticated') };

export const userWith = (roles: [Role, ...Role[]], overrides: Partial<MeResponse> = {}) => ({
  id: '01890a5d-ac96-774b-bcce-b302099a8057',
  email: 'someone@example.com',
  name: 'Ada Lovelace',
  avatarUrl: null,
  roles,
  ...overrides,
});

/** `/me` answers with a user holding `roles`. */
export const signedInWith = (
  roles: [Role, ...Role[]],
  overrides: Partial<MeResponse> = {},
): Record<string, Reply> => ({ '/me': { status: 200, body: userWith(roles, overrides) } });
