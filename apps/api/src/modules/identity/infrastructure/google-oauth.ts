import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { GoogleConfig } from '../../../shared/config/config.ts';
import type { GoogleAuth } from '../application/google-auth.ts';

const authorizationEndpoint = 'https://accounts.google.com/o/oauth2/v2/auth';
const tokenEndpoint = 'https://oauth2.googleapis.com/token';
const scopes = 'openid email profile';

/** The token endpoint couldn't be reached (network, DNS, TLS); `cause` has the details. */
export class GoogleUnreachableError extends Error {
  constructor(cause: unknown) {
    super('Google token endpoint unreachable', { cause });
    this.name = 'GoogleUnreachableError';
  }
}

const IdTokenClaims = z.object({
  iss: z.enum(['https://accounts.google.com', 'accounts.google.com']),
  aud: z.string(),
  exp: z.number(),
  sub: z.string().min(1),
  email: z.string().min(1),
  email_verified: z.boolean(),
  name: z.string().optional(),
  picture: z.string().optional(),
});

const TokenResponse = z.object({ id_token: z.string() });
const OAuthErrorResponse = z.object({ error: z.string() });

/** 32 random bytes, base64url without padding (43 characters): `state` and the PKCE verifier. */
const randomToken = () => randomBytes(32).toString('base64url');

/** PKCE S256 (RFC 7636 §4.2). */
const codeChallenge = (verifier: string) =>
  createHash('sha256').update(verifier).digest('base64url');

const formEncode = (value: string) => new URLSearchParams({ v: value }).toString().slice(2);

/** RFC 6749 §2.3.1: each part is form-encoded before Basic. */
const basicCredentials = (clientId: string, clientSecret: string) =>
  Buffer.from(`${formEncode(clientId)}:${formEncode(clientSecret)}`).toString('base64');

/** The JWT's payload, or `undefined` when it isn't a JWT carrying JSON. */
const jwtPayload = (jwt: string): unknown => {
  const [, payload] = jwt.split('.');
  if (payload === undefined) return undefined;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return undefined;
  }
};

const readJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
};

/**
 * Google sign-in: authorization code + PKCE against Google's endpoints. The ID token's signature
 * isn't checked: it comes straight from Google's token endpoint over TLS, which OIDC Core
 * §3.1.3.7 accepts instead. Its issuer, audience and expiry are checked.
 */
export const createGoogleAuth = (
  { clientId, clientSecret, redirectUri }: GoogleConfig,
  now: () => Date = () => new Date(),
): GoogleAuth => ({
  start: () => {
    const state = randomToken();
    const codeVerifier = randomToken();
    const url = new URL(authorizationEndpoint);
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      state,
      scope: scopes,
      code_challenge: codeChallenge(codeVerifier),
      code_challenge_method: 'S256',
      // Lets people with several Google accounts pick the right one.
      prompt: 'select_account',
    }).toString();
    return { url, state, codeVerifier };
  },

  exchange: async (code, codeVerifier) => {
    let response: Response;
    try {
      response = await fetch(
        new Request(tokenEndpoint, {
          method: 'POST',
          headers: {
            authorization: `Basic ${basicCredentials(clientId, clientSecret)}`,
            accept: 'application/json',
            'content-type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri,
            code_verifier: codeVerifier,
          }),
        }),
      );
    } catch (error) {
      throw new GoogleUnreachableError(error);
    }

    const body = await readJson(response);
    // Google answered with an OAuth error (bad, reused or expired code); anything else throws.
    if (response.status === 400 || response.status === 401) {
      if (OAuthErrorResponse.safeParse(body).success) return { ok: false, reason: 'code_rejected' };
      throw new Error(`Unexpected ${response.status} from Google's token endpoint`);
    }
    const tokens = response.status === 200 ? TokenResponse.safeParse(body) : undefined;
    if (!tokens?.success) {
      throw new Error(`Unexpected ${response.status} response from Google's token endpoint`);
    }

    const parsed = IdTokenClaims.safeParse(jwtPayload(tokens.data.id_token));
    if (
      !parsed.success ||
      parsed.data.aud !== clientId ||
      parsed.data.exp * 1000 <= now().getTime()
    ) {
      return { ok: false, reason: 'invalid_id_token' };
    }
    const claims = parsed.data;
    return {
      ok: true,
      identity: {
        sub: claims.sub,
        email: claims.email,
        emailVerified: claims.email_verified,
        name: claims.name ?? null,
        picture: claims.picture ?? null,
      },
    };
  },
});
