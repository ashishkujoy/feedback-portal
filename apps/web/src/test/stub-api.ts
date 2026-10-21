import { vi } from 'vitest';

type Reply = Readonly<{ status: number; body?: unknown; contentType?: string }>;

const problem = (status: number, code: string) => ({
  status,
  contentType: 'application/problem+json',
  body: { type: 'about:blank', title: 'Error', status, code, requestId: 'req-1' },
});

/** Canned answers for the API paths a test needs (`/me`, …); anything else is a 404 problem. */
export const stubApi = (replies: Readonly<Record<string, Reply>>) => {
  const fetchMock = vi.fn<typeof fetch>((input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = url.replace(/^\/api/, '');
    const reply = replies[path] ?? problem(404, 'not_found');
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

export const signedOut = { '/me': problem(401, 'unauthenticated') } as const;
