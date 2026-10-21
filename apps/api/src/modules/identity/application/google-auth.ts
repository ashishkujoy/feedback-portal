/** What we use from Google's ID token, after its claims were checked. */
export type GoogleIdentity = Readonly<{
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
}>;

/** Expected failures; anything else (Google unreachable, a bug) is thrown. */
export type GoogleExchangeFailure = 'code_rejected' | 'invalid_id_token';

export type GoogleAuth = Readonly<{
  /** A fresh `state` and PKCE verifier, and the Google URL to send the browser to. */
  start: () => Readonly<{ url: URL; state: string; codeVerifier: string }>;
  exchange: (
    code: string,
    codeVerifier: string,
  ) => Promise<
    | Readonly<{ ok: true; identity: GoogleIdentity }>
    | Readonly<{ ok: false; reason: GoogleExchangeFailure }>
  >;
}>;
