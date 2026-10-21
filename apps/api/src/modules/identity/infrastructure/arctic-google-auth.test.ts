import { afterEach, describe, expect, it, vi } from 'vitest';
import { createArcticGoogleAuth } from './arctic-google-auth.ts';

const config = {
  clientId: 'client-id.apps.example',
  clientSecret: 'client-secret',
  redirectUri: 'http://localhost:3000/auth/google/callback',
};
const now = new Date('2026-03-01T10:00:00.000Z');
const nowSeconds = now.getTime() / 1000;

const validClaims = {
  iss: 'https://accounts.google.com',
  aud: config.clientId,
  exp: nowSeconds + 3600,
  sub: 'google-sub-1',
  email: 'mentor@example.com',
  email_verified: true,
  name: 'A Mentor',
  picture: 'https://example.com/a.png',
};

const base64url = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const idToken = (claims: object) =>
  `${base64url({ alg: 'RS256', typ: 'JWT' })}.${base64url(claims)}.signature`;

/** Answers Google's token endpoint; records what Arctic sent. */
const stubTokenEndpoint = (response: Response) => {
  const requests: Request[] = [];
  vi.stubGlobal('fetch', (request: Request) => {
    requests.push(request);
    return Promise.resolve(response);
  });
  return requests;
};

const tokenResponse = (claims: object) =>
  Response.json({
    access_token: 'access',
    token_type: 'Bearer',
    expires_in: 3600,
    id_token: idToken(claims),
  });

const google = () => createArcticGoogleAuth(config, () => now);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createArcticGoogleAuth', () => {
  it('starts with PKCE, state, the scopes and account selection', () => {
    const { url, state, codeVerifier } = google().start();

    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      response_type: 'code',
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      state,
      scope: 'openid email profile',
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });
    expect(url.searchParams.get('code_challenge')).toMatch(/^[\w-]{43}$/);
    expect(codeVerifier).not.toBe(state);
    expect(google().start().state).not.toBe(state);
  });

  it('exchanges the code with the verifier and maps the claims', async () => {
    const requests = stubTokenEndpoint(tokenResponse(validClaims));

    expect(await google().exchange('the-code', 'the-verifier')).toEqual({
      ok: true,
      identity: {
        sub: 'google-sub-1',
        email: 'mentor@example.com',
        emailVerified: true,
        name: 'A Mentor',
        picture: 'https://example.com/a.png',
      },
    });
    const [request] = requests;
    expect(request?.url).toBe('https://oauth2.googleapis.com/token');
    const body = new URLSearchParams(await request?.text());
    expect(Object.fromEntries(body)).toMatchObject({
      grant_type: 'authorization_code',
      code: 'the-code',
      code_verifier: 'the-verifier',
      redirect_uri: config.redirectUri,
    });
  });

  it('accepts the issuer without a scheme and missing optional claims', async () => {
    const { name: _name, picture: _picture, ...required } = validClaims;
    stubTokenEndpoint(tokenResponse({ ...required, iss: 'accounts.google.com' }));

    expect(await google().exchange('c', 'v')).toMatchObject({
      ok: true,
      identity: { name: null, picture: null },
    });
  });

  it.each([
    ['another audience', { aud: 'someone-else' }],
    ['another issuer', { iss: 'https://evil.example.com' }],
    ['an expired token', { exp: nowSeconds }],
    ['no email', { email: undefined }],
    ['no sub', { sub: '' }],
  ])('rejects %s as invalid_id_token', async (_, overrides) => {
    stubTokenEndpoint(tokenResponse({ ...validClaims, ...overrides }));

    expect(await google().exchange('c', 'v')).toEqual({ ok: false, reason: 'invalid_id_token' });
  });

  it('reports an OAuth error from Google as code_rejected', async () => {
    stubTokenEndpoint(Response.json({ error: 'invalid_grant' }, { status: 400 }));

    expect(await google().exchange('c', 'v')).toEqual({ ok: false, reason: 'code_rejected' });
  });

  it('throws when Google is unreachable', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('fetch failed')));

    await expect(google().exchange('c', 'v')).rejects.toThrow('Failed to send request');
  });
});
