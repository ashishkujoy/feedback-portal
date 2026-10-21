import {
  decodeIdToken,
  generateCodeVerifier,
  generateState,
  Google,
  OAuth2RequestError,
} from 'arctic';
import { z } from 'zod';
import type { GoogleConfig } from '../../../shared/config/config.ts';
import type { GoogleAuth } from '../application/google-auth.ts';

const scopes = ['openid', 'email', 'profile'];

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

/**
 * Google sign-in through Arctic (authorization code + PKCE). The ID token's signature isn't
 * checked: it comes straight from Google's token endpoint over TLS, which OIDC Core §3.1.3.7
 * accepts instead. Its issuer, audience and expiry are checked.
 */
export const createArcticGoogleAuth = (
  { clientId, clientSecret, redirectUri }: GoogleConfig,
  now: () => Date = () => new Date(),
): GoogleAuth => {
  const google = new Google(clientId, clientSecret, redirectUri);

  return {
    start: () => {
      const state = generateState();
      const codeVerifier = generateCodeVerifier();
      const url = google.createAuthorizationURL(state, codeVerifier, scopes);
      // Lets people with several Google accounts pick the right one.
      url.searchParams.set('prompt', 'select_account');
      return { url, state, codeVerifier };
    },

    exchange: async (code, codeVerifier) => {
      let idToken: string;
      try {
        idToken = (await google.validateAuthorizationCode(code, codeVerifier)).idToken();
      } catch (error) {
        // Google answered with an OAuth error (bad, reused or expired code); other errors throw.
        if (error instanceof OAuth2RequestError) return { ok: false, reason: 'code_rejected' };
        throw error;
      }
      const parsed = IdTokenClaims.safeParse(decodeIdToken(idToken));
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
  };
};
